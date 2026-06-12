import type { SkillDetail } from '@cogentrex/shared';
import { describe, expect, it } from 'vitest';
import { buildSkillAssistRunAudit, selectSkillAssistContext, withSkillAssistSystemMessage } from '../skills/skillAssist.js';

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

  it('selects the algorithmic art guidance for generative artwork prompts', () => {
    const selection = selectSkillAssistContext('Create algorithmic art with p5.js, motion, palette constraints, and exportable code');

    expect(selection.contexts.map((context) => context.slug)).toContain('algorithmic-art');
    expect(selection.systemPrompt).toContain('--- Skill: algorithmic-art');
    expect(selection.systemPrompt).toContain('Generate executable creative-code artifacts');
  });

  it('uses an explicit selected skill slug instead of adding auto-selected skills', () => {
    const selection = selectSkillAssistContext(
      'Fix Azure Container Apps deployment with TypeScript tests',
      3,
      undefined,
      'algorithmic-art',
    );

    expect(selection.contexts.map((context) => context.slug)).toEqual(['algorithmic-art']);
    expect(selection.systemPrompt).toContain('--- Skill: algorithmic-art');
    expect(selection.systemPrompt).not.toContain('--- Skill: azure-container-apps');
  });

  it('uses multiple explicit selected skill slugs in the requested order and asks for each selected output', () => {
    const selection = selectSkillAssistContext(
      'Plan an MVP and produce a diagram',
      6,
      undefined,
      ['scrum-delivery-planner', 'pmp-risk-register', 'excalidraw-diagramming'],
    );

    expect(selection.contexts.map((context) => context.slug)).toEqual([
      'scrum-delivery-planner',
      'pmp-risk-register',
      'excalidraw-diagramming',
    ]);
    expect(selection.systemPrompt).toContain('--- Skill: scrum-delivery-planner');
    expect(selection.systemPrompt).toContain('--- Skill: pmp-risk-register');
    expect(selection.systemPrompt).toContain('--- Skill: excalidraw-diagramming');
    expect(selection.systemPrompt).toContain('When the user selects Excalidraw or asks for a chart/diagram/whiteboard, return a renderable fenced code block labeled `excalidraw` containing JSON');
    expect(selection.systemPrompt).toContain('Do not use ASCII art for the primary diagram unless the user explicitly asks for ASCII.');
    expect(selection.systemPrompt).toContain('When the user manually selects multiple skills, produce a clearly labeled output for each selected skill unless one is impossible or inappropriate.');
    expect(selection.systemPrompt).toContain('If you omit a selected skill output, explain why in one sentence.');
  });

  it('surfaces curated PM and visual/diagram skills for automatic matching', () => {
    const pm = selectSkillAssistContext('Use scrum to plan stakeholder risks for this project', 3);
    const visual = selectSkillAssistContext('Create an Excalidraw or Mermaid architecture diagram and polished design mockup', 3);

    expect(pm.contexts.map((context) => context.slug)).toEqual([
      'scrum-delivery-planner',
      'project-management-coach',
      'pmp-risk-register',
    ]);
    expect(visual.contexts.map((context) => context.slug)).toEqual([
      'excalidraw-diagramming',
      'mermaid-diagrams',
      'claude-design',
    ]);
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

describe('skill assist run audit', () => {
  it('marks selected diagram skills as used or skipped based on detected output', () => {
    const audit = buildSkillAssistRunAudit({
      selectedSlugs: ['excalidraw-diagramming', 'mermaid-diagrams'],
      injectedSlugs: ['excalidraw-diagramming', 'mermaid-diagrams'],
      assistantContent: [
        'Here is the renderable diagram:',
        '```mermaid',
        'flowchart TD',
        '  A[User] --> B[Cogentrex]',
        '```',
      ].join('\n'),
    });

    expect(audit).toEqual([
      {
        slug: 'excalidraw-diagramming',
        label: 'Excalidraw Diagramming',
        status: 'skipped',
        selected: true,
        injected: true,
        reason: 'No compatible Excalidraw JSON artifact was detected in the assistant output.',
      },
      {
        slug: 'mermaid-diagrams',
        label: 'Mermaid Diagrams',
        status: 'used',
        selected: true,
        injected: true,
        reason: 'Detected a Mermaid code block in the assistant output.',
      },
    ]);
  });

  it('keeps unavailable selected skills visible as skipped audit entries', () => {
    expect(buildSkillAssistRunAudit({
      selectedSlugs: ['unknown-skill'],
      injectedSlugs: [],
      assistantContent: 'Plain answer',
    })).toEqual([
      {
        slug: 'unknown-skill',
        label: 'unknown-skill',
        status: 'skipped',
        selected: true,
        injected: false,
        reason: 'Selected by the user, but no matching Skill Assist context was available for the model prompt.',
      },
    ]);
  });
});
