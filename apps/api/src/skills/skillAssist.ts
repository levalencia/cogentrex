import type { SkillDetail } from '@cogentrex/shared';
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
    ...assistConfig.instructions,
  ];
  return lines.filter((line): line is string => Boolean(line)).join('\n');
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

export function selectSkillAssistContext(query: string, maxSkills = 3, registrySkills?: SkillDetail[]): SkillAssistSelection {
  const registryCatalog = registrySkills && registrySkills.length > 0 ? buildRegistryContexts(registrySkills) : [];
  const catalog = registryCatalog.length > 0 ? [...registryCatalog, ...SKILL_ASSIST_CATALOG] : SKILL_ASSIST_CATALOG;
  const ranked = catalog
    .map((context) => ({ context, score: scoreContext(context, query) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.context.name.localeCompare(right.context.name));

  const contexts = (ranked.length ? ranked : catalog.slice(0, 1).map((context) => ({ context, score: 0 })))
    .slice(0, maxSkills)
    .map((item) => item.context);

  const skillBlocks = contexts.map((context) => [
    `--- Skill: ${context.slug}`,
    `Name: ${context.name}`,
    `Description: ${context.description}`,
    context.content,
  ].join('\n'));

  return {
    contexts,
    systemPrompt: [
      'You are Cogentrex in Skill Assist mode.',
      'Use the selected operating skills below as guidance for this response.',
      'Do not mention internal skill selection unless the user asks. Do not invent sources, credentials, benchmarks, or completed work.',
      ...skillBlocks,
    ].join('\n\n'),
  };
}

export function withSkillAssistSystemMessage(messages: ModelMessage[], query: string, registrySkills?: SkillDetail[]): { messages: ModelMessage[]; skillSlugs: string[] } {
  const selection = selectSkillAssistContext(query, 3, registrySkills);
  return {
    messages: [{ role: 'system', content: selection.systemPrompt }, ...messages],
    skillSlugs: selection.contexts.map((context) => context.slug),
  };
}
