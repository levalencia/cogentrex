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

  it('passes Skill Assist selection into the provider prompt and records run observability', async () => {
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
    expect(llm.calls[0]?.[0]?.content).toContain('--- Skill: flight-search');
    expect(llm.calls[0]?.[0]?.content).toContain('Use the registry-backed travel workflow playbook');

    const conversations = await agent.get('/api/chat/conversations').expect(200);
    const conversationId = conversations.body.conversations[0].id as string;
    const runs = await agent.get('/api/skills/runs').expect(200);
    expect(runs.body.runs).toContainEqual(expect.objectContaining({
      skillSlug: 'chat',
      mode: 'CHAT',
      status: 'completed',
      conversationId,
      observability: expect.objectContaining({
        skillAssistEnabled: true,
        skillAssistSlugs: expect.arrayContaining(['flight-search']),
      }),
    }));

    database.close();
  });
});
