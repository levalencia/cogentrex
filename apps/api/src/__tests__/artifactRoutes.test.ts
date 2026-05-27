import { describe, expect, it } from 'vitest';
import { makeTestApp, registerAndLogin } from './testApp.js';

async function seedConversationWithAssistantMessage(
  database: Awaited<ReturnType<typeof makeTestApp>>['database'],
  userId: string,
  input: { conversationId?: string; messageId?: string; title?: string; mode?: string; content?: string } = {},
) {
  const now = new Date('2026-05-22T20:00:00.000Z').toISOString();
  const conversationId = input.conversationId ?? `conv-${Math.random().toString(36).slice(2)}`;
  const messageId = input.messageId ?? `msg-${Math.random().toString(36).slice(2)}`;
  await database.adapter.prepare(
    `INSERT INTO conversations (id, user_id, title, mode, created_at, updated_at)
     VALUES (@id, @userId, @title, @mode, @now, @now)`,
  ).run({
    id: conversationId,
    userId,
    title: input.title ?? 'Market research brief',
    mode: input.mode ?? 'DEEP_RESEARCH',
    now,
  });
  await database.adapter.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, metadata_json, created_at)
     VALUES (@id, @conversationId, 'assistant', @content, @metadataJson, @now)`,
  ).run({
    id: messageId,
    conversationId,
    content: input.content ?? 'Final brief with citation [1].',
    metadataJson: JSON.stringify({ sources: [{ id: 1, title: 'Source', url: 'https://example.com' }] }),
    now,
  });
  return { conversationId, messageId };
}

describe('artifact routes', () => {
  it('lists artifacts across the authenticated user library with conversation metadata', async () => {
    const { agent, database } = await makeTestApp();
    const user = await registerAndLogin(agent);
    const { conversationId } = await seedConversationWithAssistantMessage(database, user.id, {
      title: 'AI research brief',
      mode: 'DEEP_RESEARCH',
    });

    await database.adapter.prepare(
      `INSERT INTO artifacts (id, user_id, conversation_id, message_id, type, filename, language, content, size_bytes, created_at)
       VALUES ('art-1', @userId, @conversationId, 'msg-1', 'text/markdown', 'AI research brief.md', 'markdown', '# Brief', 7, '2026-05-22T20:01:00.000Z')`,
    ).run({ userId: user.id, conversationId });

    const response = await agent.get('/api/artifacts').expect(200);

    expect(response.body.artifacts).toHaveLength(1);
    expect(response.body.artifacts[0]).toMatchObject({
      id: 'art-1',
      conversationId,
      filename: 'AI research brief.md',
      conversationTitle: 'AI research brief',
      conversationMode: 'DEEP_RESEARCH',
    });
  });

  it('uses the latest linked skill run mode when library conversation metadata is stale', async () => {
    const { agent, database } = await makeTestApp();
    const user = await registerAndLogin(agent);
    const { conversationId } = await seedConversationWithAssistantMessage(database, user.id, {
      title: 'Started as chat',
      mode: 'CHAT',
    });

    await database.adapter.prepare(
      `INSERT INTO skill_runs (
        id, user_id, skill_id, skill_slug, skill_name, mode, status,
        conversation_id, job_id, provider_id, started_at, completed_at, duration_ms, observability_json
      ) VALUES (
        'skr-stale-research', @userId, 'skl_deep_research', 'deep-research', 'Deep Research', 'DEEP_RESEARCH', 'completed',
        @conversationId, 'job-1', NULL, '2026-05-22T20:01:00.000Z', '2026-05-22T20:03:00.000Z', 120000, '{"sourceCount":3}'
      )`,
    ).run({ userId: user.id, conversationId });

    await database.adapter.prepare(
      `INSERT INTO artifacts (id, user_id, conversation_id, message_id, type, filename, language, content, size_bytes, created_at)
       VALUES ('art-stale-research', @userId, @conversationId, 'msg-stale', 'text/markdown', 'Research answer.md', 'markdown', '# Research', 10, '2026-05-22T20:04:00.000Z')`,
    ).run({ userId: user.id, conversationId });

    const response = await agent.get('/api/artifacts').expect(200);

    expect(response.body.artifacts[0]).toMatchObject({
      id: 'art-stale-research',
      conversationTitle: 'Started as chat',
      conversationMode: 'DEEP_RESEARCH',
      baseConversationMode: 'CHAT',
      effectiveMode: 'DEEP_RESEARCH',
      skillRunId: 'skr-stale-research',
      skillRunName: 'Deep Research',
      skillRunStatus: 'completed',
    });

    const detailResponse = await agent.get('/api/artifacts/art-stale-research').expect(200);
    expect(detailResponse.body.artifact).toMatchObject({
      id: 'art-stale-research',
      conversationTitle: 'Started as chat',
      conversationMode: 'DEEP_RESEARCH',
      baseConversationMode: 'CHAT',
      effectiveMode: 'DEEP_RESEARCH',
      skillRunId: 'skr-stale-research',
      skillRunName: 'Deep Research',
      skillRunStatus: 'completed',
    });

    database.close();
  });

  it('uses a saved artifact skill-run link before falling back to a newer chat run', async () => {
    const { agent, database } = await makeTestApp();
    const user = await registerAndLogin(agent);
    const { conversationId } = await seedConversationWithAssistantMessage(database, user.id, {
      messageId: 'msg-legacy-research-answer',
      title: 'Started as chat',
      mode: 'CHAT',
    });

    await database.adapter.prepare(
      `INSERT INTO skill_runs (
        id, user_id, skill_id, skill_slug, skill_name, mode, status,
        conversation_id, job_id, provider_id, started_at, completed_at, duration_ms, observability_json
      ) VALUES
      (
        'skr-legacy-research-link', @userId, 'skl_deep_research', 'deep-research', 'Deep Research', 'DEEP_RESEARCH', 'completed',
        @conversationId, 'job-1', NULL, '2026-05-22T20:01:00.000Z', '2026-05-22T20:03:00.000Z', 120000, '{"savedArtifactIds":["art-legacy-research"],"savedArtifactCount":1}'
      ),
      (
        'skr-later-chat-after-save', @userId, 'skl_chat', 'chat', 'Chat', 'CHAT', 'completed',
        @conversationId, NULL, NULL, '2026-05-22T20:05:00.000Z', '2026-05-22T20:06:00.000Z', 60000, '{"messageId":"msg-later-chat","estimatedTokens":12}'
      )`,
    ).run({ userId: user.id, conversationId });

    await database.adapter.prepare(
      `INSERT INTO artifacts (id, user_id, conversation_id, message_id, type, filename, language, content, size_bytes, created_at)
       VALUES ('art-legacy-research', @userId, @conversationId, 'msg-legacy-research-answer', 'text/markdown', 'Legacy research answer.md', 'markdown', '# Research', 10, '2026-05-22T20:04:00.000Z')`,
    ).run({ userId: user.id, conversationId });

    const response = await agent.get('/api/artifacts').expect(200);

    expect(response.body.artifacts[0]).toMatchObject({
      id: 'art-legacy-research',
      conversationTitle: 'Started as chat',
      conversationMode: 'DEEP_RESEARCH',
      baseConversationMode: 'CHAT',
      effectiveMode: 'DEEP_RESEARCH',
      skillRunId: 'skr-legacy-research-link',
      skillRunName: 'Deep Research',
      skillRunStatus: 'completed',
    });

    const detailResponse = await agent.get('/api/artifacts/art-legacy-research').expect(200);
    expect(detailResponse.body.artifact).toMatchObject({
      id: 'art-legacy-research',
      conversationMode: 'DEEP_RESEARCH',
      effectiveMode: 'DEEP_RESEARCH',
      skillRunId: 'skr-legacy-research-link',
    });

    database.close();
  });

  it('uses the skill run tied to the saved assistant message instead of a newer chat run', async () => {
    const { agent, database } = await makeTestApp();
    const user = await registerAndLogin(agent);
    const { conversationId, messageId } = await seedConversationWithAssistantMessage(database, user.id, {
      messageId: 'msg-research-answer',
      title: 'Started as chat',
      mode: 'CHAT',
    });

    await database.adapter.prepare(
      `INSERT INTO skill_runs (
        id, user_id, skill_id, skill_slug, skill_name, mode, status,
        conversation_id, job_id, provider_id, started_at, completed_at, duration_ms, observability_json
      ) VALUES
      (
        'skr-research-message', @userId, 'skl_deep_research', 'deep-research', 'Deep Research', 'DEEP_RESEARCH', 'completed',
        @conversationId, 'job-1', NULL, '2026-05-22T20:01:00.000Z', '2026-05-22T20:03:00.000Z', 120000, '{"messageId":"msg-research-answer","sourceCount":3}'
      ),
      (
        'skr-later-chat', @userId, 'skl_chat', 'chat', 'Chat', 'CHAT', 'completed',
        @conversationId, NULL, NULL, '2026-05-22T20:05:00.000Z', '2026-05-22T20:06:00.000Z', 60000, '{"messageId":"msg-later-chat","estimatedTokens":12}'
      )`,
    ).run({ userId: user.id, conversationId });

    const response = await agent
      .post('/api/artifacts/from-message')
      .send({ messageId })
      .expect(201);

    expect(response.body.artifact).toMatchObject({
      conversationTitle: 'Started as chat',
      conversationMode: 'DEEP_RESEARCH',
      baseConversationMode: 'CHAT',
      effectiveMode: 'DEEP_RESEARCH',
      skillRunId: 'skr-research-message',
      skillRunName: 'Deep Research',
      skillRunStatus: 'completed',
    });

    const listResponse = await agent.get('/api/artifacts').expect(200);
    expect(listResponse.body.artifacts[0]).toMatchObject({
      conversationMode: 'DEEP_RESEARCH',
      skillRunId: 'skr-research-message',
      skillRunName: 'Deep Research',
    });

    const runsResponse = await agent.get('/api/skills/runs').expect(200);
    const researchRun = runsResponse.body.runs.find((run: { id: string }) => run.id === 'skr-research-message');
    const chatRun = runsResponse.body.runs.find((run: { id: string }) => run.id === 'skr-later-chat');
    expect(researchRun.observability).toMatchObject({ savedArtifactCount: 1 });
    expect(chatRun.observability).not.toHaveProperty('savedArtifactCount');

    database.close();
  });

  it('saves an assistant message as a reusable library artifact', async () => {
    const { agent, database } = await makeTestApp();
    const user = await registerAndLogin(agent);
    const { conversationId, messageId } = await seedConversationWithAssistantMessage(database, user.id, {
      title: 'Flight research',
      content: 'Research answer with useful source [1].',
    });

    const response = await agent
      .post('/api/artifacts/from-message')
      .send({ messageId })
      .expect(201);

    expect(response.body.artifact).toMatchObject({
      conversationId,
      messageId,
      type: 'text/markdown',
      filename: 'Flight research.md',
      language: 'markdown',
      conversationTitle: 'Flight research',
      conversationMode: 'DEEP_RESEARCH',
    });
    expect(response.body.artifact.content).toContain('Research answer with useful source [1].');
    expect(response.body.artifact.content).toContain('## Sources');
    expect(response.body.artifact.content).toContain('[1] Source — https://example.com');

    const listResponse = await agent.get('/api/artifacts').expect(200);
    expect(listResponse.body.artifacts).toHaveLength(1);
  });
});
