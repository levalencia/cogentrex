import type { SkillAssistMode, SkillDetail } from '@cogentrex/shared';
import type { ModelMessage } from '../chat/languageModel.js';

export interface SkillAssistContext {
  slug: string;
  name: string;
  description: string;
  content: string;
  keywords: string[];
}

export interface SkillAssistSelection {
  contexts: SkillAssistContext[];
  systemPrompt: string;
}

export interface SkillAssistAuditItem {
  slug: string;
  label: string;
  status: 'used' | 'skipped';
  selected: boolean;
  injected: boolean;
  reason: string;
}

interface SkillAssistConfig {
  keywords: string[];
  instructions: string[];
}

const SKILL_ASSIST_CATALOG: SkillAssistContext[] = [
  {
    slug: 'azure-container-apps',
    name: 'Azure Container Apps deployment',
    description: 'Use when deploying, debugging, or operating apps on Azure Container Apps.',
    keywords: ['azure', 'container app', 'container apps', 'aca', 'deployment', 'deploy', 'docker', 'acr', 'revision', 'ingress', 'scale', 'cold start'],
    content: [
      'Check build-time versus runtime configuration separately; NEXT_PUBLIC_* values must be available at web build time.',
      'For Apple Silicon local builds targeting Azure Container Apps, build linux/amd64 images.',
      'Verify Container App revision status, ingress target port, environment variables, and image architecture before changing application code.',
      'Prefer small verified rollout steps: build, typecheck/test, inspect generated image/container logs, then smoke the public URL.',
    ].join('\n'),
  },
  {
    slug: 'source-grounded-research',
    name: 'Source-grounded research answer',
    description: 'Use when the user needs researched, cited, or evidence-backed answers.',
    keywords: ['research', 'sources', 'citations', 'evidence', 'brief', 'paper', 'compare', 'market', 'latest', 'current'],
    content: [
      'Separate claims from evidence. Prefer primary or official sources when available.',
      'Preserve source URLs and avoid inventing citations, benchmarks, or traction.',
      'When evidence is thin, say what is missing and recommend a narrower next search.',
      'Synthesize the answer around the user decision, not around a raw source dump.',
    ].join('\n'),
  },
  {
    slug: 'product-scope-guardrails',
    name: 'Product scope guardrails',
    description: 'Use when turning feature ideas into small shippable Cogentrex increments.',
    keywords: ['feature', 'mvp', 'roadmap', 'scope', 'plan', 'product', 'ux', 'cockpit', 'workflow', 'agent'],
    content: [
      'Recommend the smallest useful version that closes a real product loop.',
      'Call out scope creep and split large ideas into thin vertical slices.',
      'Make tradeoffs explicit: user value, implementation effort, risk, cost, and maintenance burden.',
      'Define acceptance criteria and verification before expanding the surface area.',
    ].join('\n'),
  },
  {
    slug: 'scrum-delivery-planner',
    name: 'Scrum Delivery Planner',
    description: 'Use when breaking product work into epics, user stories, sprint-sized slices, and acceptance criteria.',
    keywords: ['scrum', 'scrum to plan', 'sprint', 'epic', 'user story', 'backlog', 'acceptance criteria', 'velocity', 'retro', 'standup', 'plan'],
    content: [
      'Slice work vertically around user value. Avoid infrastructure-only stories unless they unblock a visible product loop.',
      'Write stories with acceptance criteria, test notes, dependencies, and the smallest demoable outcome.',
      'Flag hidden scope creep and recommend what to defer from the sprint.',
    ].join('\n'),
  },
  {
    slug: 'project-management-coach',
    name: 'Project Management Coach',
    description: 'Use when shaping work into a credible PM plan with scope, stakeholders, delivery risks, and next actions.',
    keywords: ['project management', 'pm', 'delivery', 'stakeholder', 'stakeholder risks', 'project', 'milestone', 'timeline', 'roadmap', 'dependencies', 'status report'],
    content: [
      'Turn ambiguous work into a short delivery plan with goals, scope boundaries, owners, risks, dependencies, and decision points.',
      'Prefer a 1-page operational plan over heavy ceremony. Make assumptions explicit and separate must-have from nice-to-have.',
      'End with concrete next actions and acceptance criteria that can be verified.',
    ].join('\n'),
  },
  {
    slug: 'pmp-risk-register',
    name: 'PMP Risk Register',
    description: 'Use when identifying project risks, mitigations, owners, triggers, and contingency plans.',
    keywords: ['risk register', 'pmp', 'risk', 'risks', 'mitigation', 'contingency', 'impact', 'probability', 'issue log', 'raidd'],
    content: [
      'Separate risks from active issues. For each risk, define probability, impact, owner, trigger, mitigation, and contingency.',
      'Keep the register practical: prioritize the few risks that could change delivery, cost, quality, or credibility.',
      'Tie mitigations to concrete verification steps or decision checkpoints.',
    ].join('\n'),
  },
  {
    slug: 'typescript-fullstack-quality',
    name: 'TypeScript full-stack quality',
    description: 'Use when implementing or reviewing TypeScript, Next.js, Express, or shared contracts.',
    keywords: ['typescript', 'next', 'react', 'express', 'api', 'zod', 'schema', 'typecheck', 'test', 'vitest', 'contract'],
    content: [
      'Treat shared Zod schemas and TypeScript types as the contract between API and web.',
      'Keep changes strict-mode friendly: avoid unchecked undefined values and broad any types.',
      'Add focused regression tests around behavior before broad refactors.',
      'Rebuild shared after schema/type changes and run the smallest meaningful verification first.',
    ].join('\n'),
  },
  {
    slug: 'algorithmic-art',
    name: 'Algorithmic Art',
    description: 'Use when generating creative-code sketches, procedural visuals, palettes, or motion art specs.',
    keywords: ['algorithmic art', 'generative art', 'creative code', 'p5.js', 'processing', 'canvas', 'shader', 'palette', 'motion', 'sketch', 'procedural', 'visual art'],
    content: [
      'Generate executable creative-code artifacts or precise implementation specs, not vague visual adjectives.',
      'Ask for or infer the canvas size, palette, motion rules, interaction model, and export target when useful.',
      'Keep the first version small: one coherent system, clear parameters, and a short iteration plan.',
      'When image generation is a better endpoint, produce a clean prompt/spec handoff instead of pretending code was rendered.',
    ].join('\n'),
  },
  {
    slug: 'claude-design',
    name: 'Claude Design',
    description: 'Use when producing polished HTML mockups, landing pages, product screens, or visual design artifacts.',
    keywords: ['claude design', 'html mockup', 'landing page', 'ui design', 'prototype', 'mockup', 'visual design', 'design artifact'],
    content: [
      'Produce a self-contained visual artifact spec or HTML/CSS implementation direction with clear layout, hierarchy, states, and responsive behavior.',
      'Use real product copy and credible constraints. Avoid generic glossy AI visuals that do not serve the workflow.',
      'Call out what should be validated visually with screenshots before shipping.',
    ].join('\n'),
  },
  {
    slug: 'excalidraw-diagramming',
    name: 'Excalidraw Diagramming',
    description: 'Use when creating hand-drawn architecture, flow, sequence, or product diagrams.',
    keywords: ['excalidraw', 'diagram', 'architecture diagram', 'flow diagram', 'sequence diagram', 'hand drawn', 'whiteboard'],
    content: [
      'Structure diagrams around the user decision: actors, systems, data/control flow, failure points, and labels.',
      'Prefer a small readable diagram over a dense map. Group related elements and name arrows with actions or data.',
      'When the user selects Excalidraw or asks for a chart/diagram/whiteboard, return a renderable fenced code block labeled `excalidraw` containing JSON with { "type": "excalidraw", "elements": [...] }.',
      'Use standard Excalidraw element fields: id, type, x, y, width, height, strokeColor, backgroundColor, text, fontSize, points, startArrowhead, and endArrowhead.',
      'Do not use ASCII art for the primary diagram unless the user explicitly asks for ASCII.',
      'After the JSON block, include only a short note explaining the diagram boundaries.',
    ].join('\n'),
  },
  {
    slug: 'mermaid-diagrams',
    name: 'Mermaid Diagrams',
    description: 'Use when producing Mermaid flowcharts, sequence diagrams, state diagrams, or architecture maps.',
    keywords: ['mermaid', 'diagram', 'architecture diagram', 'flowchart', 'sequence diagram', 'state diagram', 'gantt', 'architecture map', 'diagram code'],
    content: [
      'Return valid Mermaid syntax when asked for diagram code, and keep labels short enough to render cleanly.',
      'Choose the diagram type deliberately: flowchart for systems, sequence for interactions, state for lifecycle, gantt for timelines.',
      'Include a short explanation of the diagram boundaries and what is intentionally omitted.',
    ].join('\n'),
  },
  {
    slug: 'security-and-secrets',
    name: 'Security and secrets handling',
    description: 'Use when auth, secrets, tokens, credentials, or private data are involved.',
    keywords: ['secret', 'token', 'key', 'auth', 'oauth', 'jwt', 'credential', 'password', 'security', 'cors', 'cookie'],
    content: [
      'Never print or expose secrets in logs, UI, prompts, or diagnostics.',
      'Prefer server-side secret handling and explicit redaction for operational logs.',
      'Separate authentication failures from provider/configuration failures in UX and error handling.',
      'If a secret was exposed, recommend rotation rather than reusing it.',
    ].join('\n'),
  },
];

const SKILL_ASSIST_LABELS = new Map(SKILL_ASSIST_CATALOG.map((context) => [context.slug, context.name]));

function uniqueSlugs(slugs: string[] | undefined): string[] {
  const unique: string[] = [];
  for (const slug of slugs ?? []) {
    const normalized = slug.trim();
    if (normalized && !unique.includes(normalized)) unique.push(normalized);
  }
  return unique;
}

function hasMermaidOutput(content: string): boolean {
  return /```\s*mermaid[\s\S]*?```/i.test(content);
}

function hasExcalidrawOutput(content: string): boolean {
  const fencedBlocks = Array.from(content.matchAll(/```\s*(json|excalidraw)?\s*\n([\s\S]*?)```/gi));
  return fencedBlocks.some((match) => {
    const language = match[1]?.toLowerCase() ?? '';
    if (language && language !== 'json' && language !== 'excalidraw') return false;
    const body = match[2]?.trim() ?? '';
    return /"type"\s*:\s*"excalidraw"/i.test(body) || /"elements"\s*:\s*\[/i.test(body);
  });
}

function skillOutputStatus(slug: string, assistantContent: string): { used: boolean; reason: string } | null {
  if (slug === 'mermaid-diagrams') {
    return hasMermaidOutput(assistantContent)
      ? { used: true, reason: 'Detected a Mermaid code block in the assistant output.' }
      : { used: false, reason: 'No Mermaid code block was detected in the assistant output.' };
  }
  if (slug === 'excalidraw-diagramming') {
    return hasExcalidrawOutput(assistantContent)
      ? { used: true, reason: 'Detected an Excalidraw JSON artifact in the assistant output.' }
      : { used: false, reason: 'No compatible Excalidraw JSON artifact was detected in the assistant output.' };
  }
  return null;
}

export function buildSkillAssistRunAudit(input: {
  selectedSlugs?: string[];
  injectedSlugs?: string[];
  assistantContent: string;
}): SkillAssistAuditItem[] {
  const selectedSlugs = uniqueSlugs(input.selectedSlugs);
  const injectedSlugs = uniqueSlugs(input.injectedSlugs);
  const allSlugs = uniqueSlugs([...selectedSlugs, ...injectedSlugs]);

  return allSlugs.map((slug) => {
    const selected = selectedSlugs.includes(slug);
    const injected = injectedSlugs.includes(slug);
    const outputStatus = injected ? skillOutputStatus(slug, input.assistantContent) : null;

    if (!injected) {
      return {
        slug,
        label: SKILL_ASSIST_LABELS.get(slug) ?? slug,
        status: 'skipped',
        selected,
        injected,
        reason: 'Selected by the user, but no matching Skill Assist context was available for the model prompt.',
      };
    }

    if (outputStatus) {
      return {
        slug,
        label: SKILL_ASSIST_LABELS.get(slug) ?? slug,
        status: outputStatus.used ? 'used' : 'skipped',
        selected,
        injected,
        reason: outputStatus.reason,
      };
    }

    return {
      slug,
      label: SKILL_ASSIST_LABELS.get(slug) ?? slug,
      status: 'used',
      selected,
      injected,
      reason: 'Skill guidance was injected into the model prompt.',
    };
  });
}

function scoreContext(context: SkillAssistContext, query: string): number {
  const normalized = query.toLowerCase();
  return context.keywords.reduce((score, keyword) => {
    const needle = keyword.toLowerCase();
    return normalized.includes(needle) ? score + Math.max(1, needle.split(/\s+/).length) : score;
  }, 0);
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function parseSkillAssistConfig(skill: SkillDetail): SkillAssistConfig {
  const rawConfig = skill.route?.config?.skillAssist;
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return { keywords: [], instructions: [] };
  }
  const record = rawConfig as Record<string, unknown>;
  return {
    keywords: getStringArray(record.keywords),
    instructions: getStringArray(record.instructions),
  };
}

function routeModeLabel(skill: SkillDetail): string | null {
  return skill.route?.mode ?? null;
}

function registryKeywords(skill: SkillDetail, assistConfig: SkillAssistConfig): string[] {
  return [
    skill.slug,
    skill.name,
    skill.description,
    skill.category ?? '',
    routeModeLabel(skill) ?? '',
    ...(skill.toolRequirements.map((tool) => tool.name)),
    ...assistConfig.keywords,
  ].filter((keyword) => keyword.trim().length > 0);
}

function registryContent(skill: SkillDetail, assistConfig: SkillAssistConfig): string {
  const lines = [
    skill.description,
    skill.category ? `Category: ${skill.category}` : null,
    skill.route ? `Route mode: ${skill.route.mode}` : null,
    skill.route?.searchProfile ? `Search profile: ${skill.route.searchProfile}` : null,
    skill.toolRequirements.length > 0
      ? `Tool requirements: ${skill.toolRequirements.map((tool) => `${tool.name}${tool.required ? ' (required)' : ' (optional)'}`).join(', ')}`
      : null,
    schemaSummary('Input schema', skill.inputSchema),
    schemaSummary('Output contract', skill.outputContract),
    ...assistConfig.instructions,
  ];
  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function schemaSummary(label: string, value: Record<string, unknown> | null): string | null {
  if (!value || Object.keys(value).length === 0) return null;
  try {
    const serialized = JSON.stringify(value);
    const compact = serialized.length > 1200 ? `${serialized.slice(0, 1200)}…` : serialized;
    return `${label}: ${compact}`;
  } catch {
    return `${label}: configured`;
  }
}

function hasSkillAssistConfig(config: SkillAssistConfig): boolean {
  return config.keywords.length > 0 || config.instructions.length > 0;
}

function buildRegistryContexts(skills: SkillDetail[]): SkillAssistContext[] {
  return skills.flatMap((skill) => {
    const assistConfig = parseSkillAssistConfig(skill);
    if (!hasSkillAssistConfig(assistConfig)) return [];
    return [{
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      keywords: registryKeywords(skill, assistConfig),
      content: registryContent(skill, assistConfig),
    }];
  });
}

function buildSkillAssistSelection(contexts: SkillAssistContext[], mode: SkillAssistMode, selectedSlugs: string[]): SkillAssistSelection {
  const skillBlocks = contexts.map((context) => [
    `--- Skill: ${context.slug}`,
    `Name: ${context.name}`,
    `Description: ${context.description}`,
    context.content,
  ].join('\n'));
  const injectedSlugs = contexts.map((context) => context.slug);

  return {
    contexts,
    systemPrompt: [
      'You are Cogentrex in Skill Assist mode.',
      [
        'Task composer contract:',
        `- Skill Assist mode: ${mode}`,
        `- User-selected skill slugs: ${selectedSlugs.length ? selectedSlugs.join(', ') : 'none'}`,
        `- Injected skill slugs: ${injectedSlugs.length ? injectedSlugs.join(', ') : 'none'}`,
        '- Satisfy the user task first; use skills as operating constraints, not as product names.',
        '- Respect any Input schema or Output contract fields listed in the skill blocks as the preferred output shape.',
        '- In Manual or Hybrid mode, visibly satisfy each selected skill that was injected, or include one concise reason when a selected skill is not appropriate for the task.',
      ].join('\n'),
      'Use the selected operating skills below as guidance for this response.',
      'When the user manually selects multiple skills, produce a clearly labeled output for each selected skill unless one is impossible or inappropriate.',
      'If you omit a selected skill output, explain why in one sentence.',
      'Do not mention internal skill selection unless the user asks. Do not invent sources, credentials, benchmarks, or completed work.',
      ...skillBlocks,
    ].join('\n\n'),
  };
}

function normalizePreferredSkillSlugs(preferredSkillSlug?: string | string[]): string[] {
  const slugs = Array.isArray(preferredSkillSlug) ? preferredSkillSlug : (preferredSkillSlug ? [preferredSkillSlug] : []);
  return slugs.filter((slug, index, list) => slug.trim().length > 0 && list.indexOf(slug) === index);
}

export function selectSkillAssistContext(query: string, maxSkills = 3, registrySkills?: SkillDetail[], preferredSkillSlug?: string | string[], mode: SkillAssistMode = 'auto'): SkillAssistSelection {
  const registryCatalog = registrySkills && registrySkills.length > 0 ? buildRegistryContexts(registrySkills) : [];
  const catalog = registryCatalog.length > 0 ? [...registryCatalog, ...SKILL_ASSIST_CATALOG] : SKILL_ASSIST_CATALOG;
  const preferredSlugs = normalizePreferredSkillSlugs(preferredSkillSlug);
  if (preferredSlugs.length > 0) {
    const contexts = preferredSlugs
      .map((slug) => catalog.find((context) => context.slug === slug))
      .filter((context): context is SkillAssistContext => Boolean(context))
      .filter((context, index, list) => list.findIndex((candidate) => candidate.slug === context.slug) === index)
      .slice(0, maxSkills);
    if (contexts.length > 0) return buildSkillAssistSelection(contexts, mode, preferredSlugs);
  }

  const ranked = catalog
    .map((context) => ({ context, score: scoreContext(context, query) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.context.name.localeCompare(right.context.name));

  const rankedContexts = ranked.map((item) => item.context);
  const contexts = (rankedContexts.length ? rankedContexts : catalog.slice(0, 1))
    .filter((context, index, list) => list.findIndex((candidate) => candidate.slug === context.slug) === index)
    .slice(0, maxSkills);

  return buildSkillAssistSelection(contexts, mode, preferredSlugs);
}

export function withSkillAssistSystemMessage(messages: ModelMessage[], query: string, registrySkills?: SkillDetail[], preferredSkillSlug?: string | string[], mode: SkillAssistMode = 'auto'): { messages: ModelMessage[]; skillSlugs: string[] } {
  const selection = selectSkillAssistContext(query, 6, registrySkills, preferredSkillSlug, mode);
  return {
    messages: [{ role: 'system', content: selection.systemPrompt }, ...messages],
    skillSlugs: selection.contexts.map((context) => context.slug),
  };
}
