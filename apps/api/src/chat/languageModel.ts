import OpenAI from 'openai';
import type { ChatMessage } from '@cogentrex/shared';
import type { ProviderRuntimeConfig } from '../providers/providerService.js';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

export interface LanguageModelClient {
  streamChat(provider: ProviderRuntimeConfig, messages: ModelMessage[]): AsyncIterable<string>;
  complete(provider: ProviderRuntimeConfig, messages: ModelMessage[]): Promise<string>;
}

export function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
    .map((message) => ({ role: message.role as ModelMessage['role'], content: message.content }));
}

export class OpenAICompatibleClient implements LanguageModelClient {
  async *streamChat(provider: ProviderRuntimeConfig, messages: ModelMessage[]): AsyncIterable<string> {
    const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
    let stream;
    try {
      stream = await client.chat.completions.create({
        model: provider.model,
        messages: messages as any,
        stream: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider request failed';
      throw new Error(`Provider error (${provider.name}): ${message}`);
    }

    try {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield content;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stream failed';
      throw new Error(`Provider stream error (${provider.name}): ${message}`);
    }
  }

  async complete(provider: ProviderRuntimeConfig, messages: ModelMessage[]): Promise<string> {
    const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
    try {
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: messages as any,
        stream: false,
      });
      return response.choices[0]?.message.content ?? '';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider request failed';
      throw new Error(`Provider error (${provider.name}): ${message}`);
    }
  }
}

export class FakeLanguageModelClient implements LanguageModelClient {
  constructor(private readonly response = 'Test assistant response') {}

  async *streamChat(): AsyncIterable<string> {
    for (const token of this.response.split(' ')) {
      yield `${token} `;
    }
  }

  async complete(): Promise<string> {
    return this.response;
  }
}
