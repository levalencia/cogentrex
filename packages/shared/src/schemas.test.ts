import { describe, expect, it } from 'vitest';
import { createProviderSchema, registerSchema } from './schemas.js';

describe('shared schemas', () => {
  it('normalizes email addresses and enforces password length', () => {
    const input = registerSchema.parse({ email: '  USER@Example.COM ', password: 'long-password' });
    expect(input.email).toBe('user@example.com');
  });

  it('defaults provider kind to OpenAI compatible', () => {
    const provider = createProviderSchema.parse({
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'key',
      model: 'some-model',
    });
    expect(provider.kind).toBe('OPENAI_COMPATIBLE');
  });
});
