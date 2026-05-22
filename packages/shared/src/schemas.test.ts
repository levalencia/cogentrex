import { describe, expect, it } from 'vitest';
import {
  createProviderSchema,
  registerSchema,
  skillStatusSchema,
  updateSkillRouteSchema,
  updateSkillSchema,
} from './schemas.js';

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

  it('validates skill status values', () => {
    expect(skillStatusSchema.parse('PUBLISHED')).toBe('PUBLISHED');
    expect(() => skillStatusSchema.parse('ARCHIVED')).toThrow();
  });

  it('accepts partial skill curation updates', () => {
    const update = updateSkillSchema.parse({
      name: 'Deep Research',
      status: 'STAGED',
      visibility: 'ADMIN_ONLY',
      category: null,
      toolRequirements: [{ name: 'web.search', required: true, description: 'Search the web' }],
    });

    expect(update.status).toBe('STAGED');
    expect(update.toolRequirements).toHaveLength(1);
  });

  it('accepts skill route configuration updates', () => {
    const route = updateSkillRouteSchema.parse({
      mode: 'DEEP_RESEARCH',
      defaultProviderId: null,
      searchProfile: 'default-web',
      maxBudgetCents: 250,
      config: { iterations: 3 },
    });

    expect(route.mode).toBe('DEEP_RESEARCH');
    expect(route.maxBudgetCents).toBe(250);
  });
});
