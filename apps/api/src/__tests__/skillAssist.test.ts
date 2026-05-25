import { describe, expect, it } from 'vitest';
import { selectSkillAssistContext, withSkillAssistSystemMessage } from '../skills/skillAssist.js';

const baseMessages = [
  { role: 'user' as const, content: 'How should we deploy this Next app to Azure Container Apps?' },
];

describe('skill assist prompt selection', () => {
  it('selects relevant operating skills from the user query', () => {
    const selection = selectSkillAssistContext('Plan a small MVP feature with TypeScript tests for Azure Container Apps deployment');

    expect(selection.contexts.map((context) => context.slug)).toEqual([
      'azure-container-apps',
      'product-scope-guardrails',
      'typescript-fullstack-quality',
    ]);
    expect(selection.systemPrompt).toContain('You are Cogentrex in Skill Assist mode.');
    expect(selection.systemPrompt).toContain('--- Skill: azure-container-apps');
    expect(selection.systemPrompt).toContain('--- Skill: product-scope-guardrails');
    expect(selection.systemPrompt).toContain('--- Skill: typescript-fullstack-quality');
  });

  it('prepends a system prompt without mutating the chat history', () => {
    const result = withSkillAssistSystemMessage(baseMessages, 'Need current research with sources and citations');

    expect(result.skillSlugs).toEqual(['source-grounded-research']);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({ role: 'system' });
    expect(result.messages[0]?.content).toContain('Source-grounded research answer');
    expect(result.messages[1]).toBe(baseMessages[0]);
  });
});
