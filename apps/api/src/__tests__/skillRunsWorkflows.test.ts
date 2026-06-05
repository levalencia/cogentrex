import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProvider, makeTestApp, registerAndLogin } from './testApp.js';

describe('workflow skill runs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records Social Writer generations as observable skill runs with an auditable event trace', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/social/generate')
      .send({ topic: 'Launch note for Cogentrex', platforms: ['linkedin'], useResearch: false })
      .expect(200);

    const runs = await agent.get('/api/runs').expect(200);
    const legacyRuns = await agent.get('/api/skills/runs').expect(200);
    const run = runs.body.runs.find((item: { skillSlug: string }) => item.skillSlug === 'linkedin-writer');
    expect(run).toEqual(expect.objectContaining({
      skillSlug: 'linkedin-writer',
      mode: 'SOCIAL_WRITING',
      status: 'completed',
      conversationId: response.body.conversationId,
      eventCount: 2,
    }));
    expect(legacyRuns.body.runs).toContainEqual(expect.objectContaining({ id: run.id }));

    const detail = await agent.get(`/api/runs/${run.id}`).expect(200);
    expect(detail.body.run).toEqual(expect.objectContaining({ id: run.id, skillSlug: 'linkedin-writer' }));

    const events = await agent.get(`/api/runs/${run.id}/events`).expect(200);
    const legacyEvents = await agent.get(`/api/skills/runs/${run.id}/events`).expect(200);
    expect(detail.body.events.map((event: { id: string }) => event.id)).toEqual(events.body.events.map((event: { id: string }) => event.id));
    expect(legacyEvents.body.events.map((event: { id: string }) => event.id)).toEqual(events.body.events.map((event: { id: string }) => event.id));
    expect(events.body.events).toEqual([
      expect.objectContaining({
        runId: run.id,
        sequence: 1,
        eventType: 'run_started',
        label: 'Social Writer started',
      }),
      expect.objectContaining({
        runId: run.id,
        sequence: 2,
        eventType: 'run_completed',
        label: 'Social Writer completed',
        metadata: expect.objectContaining({ postCount: 1, platforms: ['linkedin'] }),
      }),
    ]);

    await agent.get('/api/runs/skr_missing/events').expect(404);
    await agent.get('/api/skills/runs/skr_missing/events').expect(404);

    await agent
      .post('/api/auth/register')
      .send({ email: 'other-reader@example.com', password: 'super-secret-password' })
      .expect(201);
    await agent.get(`/api/skills/runs/${run.id}/events`).expect(404);

    database.close();
  });

  it('links saved library artifacts back to the originating workflow run', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/social/generate')
      .send({ topic: 'Reusable launch note for Cogentrex', platforms: ['linkedin'], useResearch: false })
      .expect(200);

    const messages = await agent
      .get(`/api/chat/conversations/${response.body.conversationId}/messages`)
      .expect(200);
    const assistantMessage = messages.body.messages.find((message: { role: string }) => message.role === 'assistant');

    const saved = await agent
      .post('/api/artifacts/from-message')
      .send({ messageId: assistantMessage.id })
      .expect(201);

    const runs = await agent.get('/api/skills/runs').expect(200);
    expect(runs.body.runs).toContainEqual(expect.objectContaining({
      skillSlug: 'linkedin-writer',
      mode: 'SOCIAL_WRITING',
      status: 'completed',
      conversationId: response.body.conversationId,
      observability: expect.objectContaining({
        savedArtifactCount: 1,
        savedArtifactIds: [saved.body.artifact.id],
        savedArtifacts: [expect.objectContaining({
          id: saved.body.artifact.id,
          filename: saved.body.artifact.filename,
          type: saved.body.artifact.type,
        })],
      }),
    }));

    database.close();
  });

  it('does not classify artifacts by partial savedArtifactIds matches', async () => {
    const { agent, database } = await makeTestApp();
    const user = await registerAndLogin(agent);
    const now = '2026-05-22T20:00:00.000Z';

    await database.adapter.prepare(
      `INSERT INTO conversations (id, user_id, title, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('conv-substring', user.id, 'Started as chat', 'CHAT', now, now);
    await database.adapter.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('msg-1', 'conv-substring', 'assistant', 'Chat artifact', now);
    await database.adapter.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('msg-10', 'conv-substring', 'assistant', 'Deep research artifact', now);
    await database.adapter.prepare(
      `INSERT INTO artifacts (id, user_id, conversation_id, message_id, type, filename, language, content, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('art-1', user.id, 'conv-substring', 'msg-1', 'text/markdown', 'Chat note.md', 'markdown', 'Chat note', 9, now);
    await database.adapter.prepare(
      `INSERT INTO artifacts (id, user_id, conversation_id, message_id, type, filename, language, content, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('art-10', user.id, 'conv-substring', 'msg-10', 'text/markdown', 'Research brief.md', 'markdown', 'Research brief', 14, now);
    await database.adapter.prepare(
      `INSERT INTO skill_runs (id, user_id, skill_id, skill_slug, skill_name, mode, status, conversation_id, started_at, completed_at, duration_ms, observability_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'run-deep-art-10',
      user.id,
      'skl_deep_research',
      'deep-research',
      'Deep Research',
      'DEEP_RESEARCH',
      'completed',
      'conv-substring',
      '2026-05-22T20:01:00.000Z',
      '2026-05-22T20:02:00.000Z',
      60000,
      JSON.stringify({ savedArtifactIds: ['art-10'], messageId: 'msg-10' }),
    );
    await database.adapter.prepare(
      `INSERT INTO skill_runs (id, user_id, skill_id, skill_slug, skill_name, mode, status, conversation_id, started_at, completed_at, duration_ms, observability_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'run-chat-latest',
      user.id,
      'skl_chat',
      'chat',
      'Chat',
      'CHAT',
      'completed',
      'conv-substring',
      '2026-05-22T20:03:00.000Z',
      '2026-05-22T20:04:00.000Z',
      60000,
      JSON.stringify({ messageId: 'msg-other' }),
    );

    const artifacts = await agent.get('/api/artifacts').expect(200);
    expect(artifacts.body.artifacts).toContainEqual(expect.objectContaining({
      id: 'art-1',
      conversationMode: 'CHAT',
      effectiveMode: 'CHAT',
      skillRunId: 'run-chat-latest',
    }));
    expect(artifacts.body.artifacts).toContainEqual(expect.objectContaining({
      id: 'art-10',
      conversationMode: 'DEEP_RESEARCH',
      effectiveMode: 'DEEP_RESEARCH',
      skillRunId: 'run-deep-art-10',
    }));

    database.close();
  });

  it('records Deep Research jobs as observable skill runs', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const planned = await agent
      .post('/api/chat/plan')
      .send({ content: 'Research Cogentrex workflow observability' })
      .expect(200);

    await agent
      .post('/api/chat/research')
      .send({ jobId: planned.body.jobId, plan: planned.body.plan })
      .expect(200);

    let runs: { body: { runs: Array<{ id: string; jobId?: string; status?: string }> } } | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      runs = await agent.get('/api/skills/runs').expect(200);
      const run = runs.body.runs.find((item: { jobId?: string; status?: string }) => item.jobId === planned.body.jobId);
      if (run?.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const run = runs?.body.runs.find((item: { jobId?: string }) => item.jobId === planned.body.jobId);
    if (!run) throw new Error('Expected Deep Research skill run to be recorded');
    expect(run).toEqual(expect.objectContaining({
      skillSlug: 'deep-research',
      mode: 'DEEP_RESEARCH',
      status: 'completed',
      conversationId: planned.body.conversationId,
      jobId: planned.body.jobId,
    }));

    const events = await agent.get(`/api/skills/runs/${run.id}/events`).expect(200);
    const eventTypes = events.body.events.map((event: { eventType: string }) => event.eventType);
    expect(eventTypes[0]).toBe('run_started');
    expect(eventTypes.at(-1)).toBe('run_completed');
    expect(eventTypes).toEqual(expect.arrayContaining([
      'research_started',
      'source_found',
      'search_completed',
      'synthesis_completed',
    ]));

    expect(events.body.events).toContainEqual(expect.objectContaining({ eventType: 'run_started', sequence: 1 }));
    expect(events.body.events).toContainEqual(expect.objectContaining({
      eventType: 'research_started',
      label: 'Research started',
      metadata: expect.objectContaining({
        jobId: planned.body.jobId,
        conversationId: planned.body.conversationId,
      }),
    }));
    expect(events.body.events).toContainEqual(expect.objectContaining({
      eventType: 'source_found',
      label: 'Source found',
      metadata: expect.objectContaining({
        sourceId: 1,
        channel: 'web',
        totalSources: 1,
      }),
    }));
    expect(events.body.events).toContainEqual(expect.objectContaining({
      eventType: 'search_completed',
      label: 'Search completed',
      metadata: expect.objectContaining({
        channel: 'web',
        totalSources: 1,
      }),
    }));
    expect(events.body.events).toContainEqual(expect.objectContaining({
      eventType: 'synthesis_completed',
      label: 'Synthesis completed',
      metadata: expect.objectContaining({
        sourceCount: 1,
        planLength: expect.any(Number),
      }),
    }));
    expect(events.body.events).toContainEqual(expect.objectContaining({
      eventType: 'run_completed',
      label: 'Deep Research completed',
      metadata: expect.objectContaining({ sourceCount: 1 }),
    }));

    database.close();
  });

  it('records Image Studio generations as observable skill runs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ url: 'https://example.com/generated.png' }] }),
    } as Response);

    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/media/generate')
      .send({ prompt: 'A credible AI research cockpit screenshot', type: 'image' })
      .expect(201);

    const runs = await agent.get('/api/skills/runs').expect(200);
    expect(runs.body.runs).toContainEqual(expect.objectContaining({
      skillSlug: 'image-studio',
      mode: 'IMAGE_GENERATION',
      status: 'completed',
      conversationId: response.body.conversationId,
    }));

    database.close();
  });
});
