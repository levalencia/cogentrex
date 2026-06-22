import { describe, expect, it } from 'vitest';
import type { ModelMessage, LanguageModelClient } from '../chat/languageModel.js';
import type { ProviderRuntimeConfig } from '../providers/providerService.js';
import { createProvider, makeTestApp, registerAndLogin } from './testApp.js';

function parseSse(text: string) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line.replace(/^data: /, '')) as { type: string; content?: string; sources?: unknown[] });
}

describe('chat streaming API', () => {
  it('streams chat responses and persists messages', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/chat/stream')
      .send({ content: 'Hello', mode: 'CHAT' })
      .expect(200);

    const events = parseSse(response.text);
    expect(events[0]?.type).toBe('start');
    expect(events.some((event) => event.type === 'delta')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');

    const conversations = await agent.get('/api/chat/conversations').expect(200);
    expect(conversations.body.conversations).toHaveLength(1);
    const conversationId = conversations.body.conversations[0].id as string;
    await agent.get(`/api/chat/conversations/${conversationId}/messages`).expect(200).expect((res) => {
      expect(res.body.messages).toHaveLength(2);
    });

    const runs = await agent.get('/api/skills/runs').expect(200);
    expect(runs.body.runs).toContainEqual(expect.objectContaining({
      skillSlug: 'chat',
      mode: 'CHAT',
      status: 'completed',
      conversationId,
    }));

    database.close();
  });

  it('saves a streamed chat assistant answer to the Library', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    await agent
      .post('/api/chat/stream')
      .send({ content: 'Save this short answer', mode: 'CHAT' })
      .expect(200);

    const conversations = await agent.get('/api/chat/conversations').expect(200);
    const conversationId = conversations.body.conversations[0].id as string;
    const messages = await agent.get(`/api/chat/conversations/${conversationId}/messages`).expect(200);
    const assistantMessage = messages.body.messages.find((message: { role: string }) => message.role === 'assistant');
    expect(assistantMessage?.id).toBeTruthy();

    const saved = await agent
      .post('/api/artifacts/from-message')
      .send({ messageId: assistantMessage.id })
      .expect(201);

    expect(saved.body.artifact).toMatchObject({
      conversationId,
      messageId: assistantMessage.id,
      content: assistantMessage.content,
      type: 'text/markdown',
    });

    const artifacts = await agent.get('/api/artifacts').expect(200);
    expect(artifacts.body.artifacts).toHaveLength(1);
    expect(artifacts.body.artifacts[0]).toMatchObject({
      id: saved.body.artifact.id,
      conversationId,
      messageId: assistantMessage.id,
    });

    const runs = await agent.get('/api/skills/runs').expect(200);
    expect(runs.body.runs).toContainEqual(expect.objectContaining({
      skillSlug: 'chat',
      mode: 'CHAT',
      status: 'completed',
      conversationId,
      observability: expect.objectContaining({
        savedArtifactCount: 1,
        savedArtifactIds: [saved.body.artifact.id],
      }),
    }));

    database.close();
  });

  it('honors explicit Skill Assist selection over prompt keyword scoring', async () => {
    class CapturingLanguageModelClient implements LanguageModelClient {
      calls: ModelMessage[][] = [];

      async *streamChat(_provider: ProviderRuntimeConfig, messages: ModelMessage[]): AsyncIterable<string> {
        this.calls.push(messages);
        yield 'Assisted response';
      }

      async complete(): Promise<string> {
        return 'Generated title';
      }
    }

    const llm = new CapturingLanguageModelClient();
    const { agent, database } = await makeTestApp({}, { llm });
    await registerAndLogin(agent);
    await createProvider(agent);

    await agent
      .post('/api/chat/stream')
      .send({
        content: 'Debug an Azure Container Apps deployment, but use the Algorithmic Art launcher context.',
        mode: 'CHAT',
        useSkills: true,
        selectedSkillSlug: 'algorithmic-art',
      })
      .expect(200);

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.[0]).toMatchObject({ role: 'system' });
    expect(llm.calls[0]?.[0]?.content).toContain('--- Skill: algorithmic-art');
    expect(llm.calls[0]?.[0]?.content).not.toContain('--- Skill: azure-container-apps');

    const runs = await agent.get('/api/skills/runs').expect(200);
    expect(runs.body.runs[0]).toEqual(expect.objectContaining({
      skillSlug: 'chat',
      mode: 'CHAT',
      status: 'completed',
      observability: expect.objectContaining({
        skillAssistEnabled: true,
        skillAssistSlugs: ['algorithmic-art'],
      }),
    }));

    database.close();
  });

  it('runs the imported skill package governance loop and injects SKILL.md into Chat Skill Assist', async () => {
    class CapturingLanguageModelClient implements LanguageModelClient {
      streamCalls: ModelMessage[][] = [];
      completeCalls: ModelMessage[][] = [];

      async *streamChat(_provider: ProviderRuntimeConfig, messages: ModelMessage[]): AsyncIterable<string> {
        this.streamCalls.push(messages);
        yield 'Founder update draft shaped by Brand Voice.';
      }

      async complete(_provider: ProviderRuntimeConfig, messages: ModelMessage[]): Promise<string> {
        this.completeCalls.push(messages);
        return 'Admin Test Output';
      }
    }

    const llm = new CapturingLanguageModelClient();
    const { agent, database } = await makeTestApp({}, { llm });
    const user = await registerAndLogin(agent);
    await database.adapter.prepare('UPDATE users SET role = ? WHERE id = ?').run('ADMIN', user.id);
    const provider = await createProvider(agent);

    const imported = await agent.post('/api/admin/skills/import-manual-kit').send({
      sourceLabel: 'founder-update-package',
      files: [
        {
          path: 'SKILL.md',
          content: '---\nname: Founder Update Voice\ndescription: Draft credible founder updates.\n---\n\nWrite concrete founder updates with no hype. Include what changed, who it helps, and what feedback is needed.',
        },
        { path: 'references/tone.md', content: '# Tone\n\nHumble, specific, builder-to-builder.' },
      ],
    }).expect(201);

    await agent.put('/api/admin/skills/founder-update-voice/route').send({
      mode: 'CHAT',
      defaultProviderId: provider.id,
      config: {
        promptTemplates: [{ id: 'launch-note', label: 'Launch note', prompt: 'Draft a founder update for: ', visibleToUsers: true }],
      },
    }).expect(200);

    await agent.patch('/api/admin/skills/founder-update-voice').send({
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
    }).expect(400);

    const testResult = await agent.post('/api/admin/skills/founder-update-voice/test').send({
      prompt: 'Draft an update for the Skill Governance Test Lab.',
      providerId: provider.id,
    }).expect(200);
    expect(testResult.body.run.skillSlug).toBe('founder-update-voice');
    expect(llm.completeCalls[0]?.[0]?.content).toContain('SKILL.md / package instructions:');

    await agent.patch('/api/admin/skills/founder-update-voice').send({
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
    }).expect(200);

    const visible = await agent.get('/api/skills').expect(200);
    expect(visible.body.skills).toContainEqual(expect.objectContaining({ slug: 'founder-update-voice' }));

    await agent.post('/api/chat/stream').send({
      content: 'Draft a founder update for shipping governed skills into Chat.',
      mode: 'CHAT',
      useSkills: true,
      skillAssistMode: 'manual',
      selectedSkillSlugs: ['founder-update-voice'],
    }).expect(200);

    expect(llm.streamCalls).toHaveLength(1);
    const systemPrompt = llm.streamCalls[0]?.[0]?.content;
    expect(systemPrompt).toContain('--- Skill: founder-update-voice');
    expect(systemPrompt).toContain('Canonical SKILL.md instructions:');
    expect(systemPrompt).toContain('Write concrete founder updates with no hype');
    expect(systemPrompt).toContain('--- references/tone.md');
    expect(systemPrompt).toContain('Humble, specific, builder-to-builder');

    const runs = await agent.get('/api/skills/runs').expect(200);
    expect(runs.body.runs).toContainEqual(expect.objectContaining({
      skillSlug: 'chat',
      mode: 'CHAT',
      status: 'completed',
      observability: expect.objectContaining({
        skillAssistEnabled: true,
        skillAssistMode: 'manual',
        skillAssistSlugs: ['founder-update-voice'],
        skillAssistAudit: [expect.objectContaining({ slug: 'founder-update-voice', status: 'used', injected: true })],
      }),
    }));
    expect(imported.body.files.map((file: { path: string }) => file.path)).toEqual(['SKILL.md', 'references/tone.md']);

    database.close();
  });

  it('passes multiple Skill Assist selections into the provider prompt and records run observability', async () => {
    class CapturingLanguageModelClient implements LanguageModelClient {
      calls: ModelMessage[][] = [];

      async *streamChat(_provider: ProviderRuntimeConfig, messages: ModelMessage[]): AsyncIterable<string> {
        this.calls.push(messages);
        yield 'Assisted response';
      }

      async complete(): Promise<string> {
        return 'Generated title';
      }
    }

    const llm = new CapturingLanguageModelClient();
    const { agent, database } = await makeTestApp({}, { llm });
    const user = await registerAndLogin(agent);
    await database.adapter.prepare('UPDATE users SET role = ? WHERE id = ?').run('ADMIN', user.id);
    await createProvider(agent);
    await agent.patch('/api/admin/skills/flight-search').send({
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
      category: 'Travel Ops',
      outputContract: {
        type: 'object',
        required: ['summary', 'nextActions'],
        properties: {
          summary: { type: 'string' },
          nextActions: { type: 'array', items: { type: 'string' } },
        },
      },
    }).expect(200);
    await agent.put('/api/admin/skills/flight-search/route').send({
      mode: 'CHAT',
      config: {
        skillAssist: {
          keywords: ['mvp', 'typescript', 'tests'],
          instructions: ['Use the registry-backed travel workflow playbook and keep the implementation evidence-driven.'],
        },
      },
    }).expect(200);

    await agent
      .post('/api/chat/stream')
      .send({ content: 'Plan an MVP feature in TypeScript with tests', mode: 'CHAT', useSkills: true })
      .expect(200);

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.[0]).toMatchObject({ role: 'system' });
    expect(llm.calls[0]?.[0]?.content).toContain('Cogentrex in Skill Assist mode');
    expect(llm.calls[0]?.[0]?.content).toContain('Task composer contract:');
    expect(llm.calls[0]?.[0]?.content).toContain('- Skill Assist mode: auto');
    expect(llm.calls[0]?.[0]?.content).toContain('--- Skill: flight-search');
    expect(llm.calls[0]?.[0]?.content).toContain('Output contract:');
    expect(llm.calls[0]?.[0]?.content).toContain('Use the registry-backed travel workflow playbook');

    await agent
      .post('/api/chat/stream')
      .send({ content: 'Do it', mode: 'CHAT', useSkills: true, skillAssistMode: 'manual', selectedSkillSlugs: ['flight-search', 'scrum-delivery-planner'] })
      .expect(200);

    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]?.[0]).toMatchObject({ role: 'system' });
    expect(llm.calls[1]?.[0]?.content).toContain('- Skill Assist mode: manual');
    expect(llm.calls[1]?.[0]?.content).toContain('- User-selected skill slugs: flight-search, scrum-delivery-planner');
    expect(llm.calls[1]?.[0]?.content).toContain('--- Skill: flight-search');
    expect(llm.calls[1]?.[0]?.content).toContain('Use the registry-backed travel workflow playbook');
    expect(llm.calls[1]?.[0]?.content).toContain('--- Skill: scrum-delivery-planner');

    const runs = await agent.get('/api/skills/runs').expect(200);
    expect(runs.body.runs).toContainEqual(expect.objectContaining({
      skillSlug: 'chat',
      mode: 'CHAT',
      status: 'completed',
      observability: expect.objectContaining({
        skillAssistEnabled: true,
        skillAssistMode: 'manual',
        skillAssistSlugs: expect.arrayContaining(['flight-search', 'scrum-delivery-planner']),
      }),
    }));

    database.close();
  });
});
