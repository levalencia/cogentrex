import type { SkillDetail } from '@cogentrex/shared';
import { describe, expect, it } from 'vitest';
import { selectSkillAssistContext, withSkillAssistSystemMessage } from '../skills/skillAssist.js';

const baseMessages = [
  { role: 'user' as const, content: 'How should we deploy this Next app to Azure Container Apps?' },
];

const registrySkills: SkillDetail[] = [
  {
    id: 'skl_visible_ops',
    slug: 'visible-ops-playbook',
    name: 'Visible Ops Playbook',
    description: 'Run a scoped TypeScript feature with tests, review, and screenshots.',
    kind: 'IMPORTED',
    status: 'PUBLISHED',
    visibility: 'USER_VISIBLE',
    category: 'Operating Skills',
    icon: null,
    inputSchema: null,
    outputContract: null,
    toolRequirements: [{ name: 'browser.qa', required: false, description: 'Capture local UI evidence' }],
    route: {
      id: 'skr_visible_ops',
      skillId: 'skl_visible_ops',
      mode: 'CHAT',
      defaultProviderId: null,
      searchProfile: null,
      maxBudgetCents: null,
      config: {
        skillAssist: {
          keywords: ['typescript', 'tests', 'pantallazos'],
          instructions: ['Keep the slice small, prove it with automated checks, and capture screenshots before PR handoff.'],
        },
      },
      createdAt: '2026-05-25T00:00:00.000Z',
      updatedAt: '2026-05-25T00:00:00.000Z',
    },
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
  },
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

  it('builds Skill Assist prompts from visible registry skill metadata when provided', () => {
    const selection = selectSkillAssistContext('Necesito TypeScript tests y pantallazos', 3, registrySkills);

    expect(selection.contexts.map((context) => context.slug)).toContain('visible-ops-playbook');
    expect(selection.systemPrompt).toContain('--- Skill: visible-ops-playbook');
    expect(selection.systemPrompt).toContain('Visible Ops Playbook');
    expect(selection.systemPrompt).toContain('Keep the slice small, prove it with automated checks');
    expect(selection.systemPrompt).toContain('Route mode: CHAT');
  });

  it('keeps the curated catalog when registry skills have no Skill Assist config', () => {
    const plainRegistrySkills: SkillDetail[] = registrySkills.map((skill) => ({
      ...skill,
      route: skill.route ? { ...skill.route, config: null } : null,
    }));

    const selection = selectSkillAssistContext('Plan a small MVP feature with TypeScript tests', 3, plainRegistrySkills);

    expect(selection.contexts.map((context) => context.slug)).toContain('product-scope-guardrails');
    expect(selection.contexts.map((context) => context.slug)).toContain('typescript-fullstack-quality');
    expect(selection.systemPrompt).not.toContain('--- Skill: visible-ops-playbook');
  });
});
