import { describe, expect, it } from 'vitest';
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

    database.close();
  });
});
