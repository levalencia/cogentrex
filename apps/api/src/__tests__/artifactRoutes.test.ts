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
      content: 'Research answer with useful source [1].',
      conversationTitle: 'Flight research',
      conversationMode: 'DEEP_RESEARCH',
    });

    const listResponse = await agent.get('/api/artifacts').expect(200);
    expect(listResponse.body.artifacts).toHaveLength(1);
  });
});
