import type { AppMode, CapabilityStatus, SkillDetail, SkillProviderRoute, SkillReadiness, SkillRunSummary } from '@cogentrex/shared';

export type SkillManifestInputType = 'text' | 'textarea' | 'number' | 'select' | 'boolean';
export type SkillManifestTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface SkillManifestInput {
  name: string;
  label: string;
  type: SkillManifestInputType;
  required: boolean;
  helpText?: string;
}

export interface SkillManifestReadiness {
  label: string;
  tone: SkillManifestTone;
  message: string;
}

export interface SkillManifestModel {
  slug: string;
  name: string;
  description: string;
  category: string;
  mode: AppMode;
  launchPath: string;
  readiness: SkillManifestReadiness;
  inputs: SkillManifestInput[];
  outputs: string[];
  requiredCapabilities: string[];
  optionalCapabilities: string[];
  latestRun: SkillRunSummary | null;
}

interface InputSchemaField {
  name?: unknown;
  label?: unknown;
  type?: unknown;
  required?: unknown;
  helpText?: unknown;
  description?: unknown;
}

const defaultPromptInput: SkillManifestInput = {
  name: 'prompt',
  label: 'Prompt',
  type: 'textarea',
  required: true,
  helpText: 'Describe what this skill should do.',
};

const fallbackOutputs = ['Task result', 'Run trace'];

export function buildSkillManifestModel(
  skill: SkillDetail,
  readiness: SkillReadiness | null,
  runs: SkillRunSummary[],
): SkillManifestModel {
  const mode = skill.route?.mode ?? 'CHAT';
  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    category: skill.category ?? 'Uncategorized',
    mode,
    launchPath: getSkillLaunchPath(skill.route),
    readiness: summarizeManifestReadiness(readiness),
    inputs: parseManifestInputs(skill.inputSchema),
    outputs: parseManifestOutputs(skill.outputContract),
    requiredCapabilities: collectCapabilities(readiness, true),
    optionalCapabilities: collectCapabilities(readiness, false),
    latestRun: findLatestRun(skill.slug, runs),
  };
}

export function getSkillLaunchPath(_route: SkillProviderRoute | null): string {
  return '/chats';
}

export function summarizeManifestReadiness(readiness: SkillReadiness | null): SkillManifestReadiness {
  if (!readiness) {
    return {
      label: 'Not checked',
      tone: 'neutral',
      message: 'Readiness has not been checked for this skill yet.',
    };
  }
  const dependency = readiness.dependencies.find((item) => item.status !== 'ready');
  if (readiness.status === 'ready') {
    return { label: 'Ready', tone: 'success', message: 'All required capabilities are ready.' };
  }
  if (readiness.status === 'degraded') {
    return {
      label: 'Limited',
      tone: 'warning',
      message: safeMessage(dependency, 'Optional capability is unavailable.'),
    };
  }
  return {
    label: 'Needs setup',
    tone: 'danger',
    message: safeMessage(dependency, 'A required capability is missing.'),
  };
}

function parseManifestInputs(schema: Record<string, unknown> | null): SkillManifestInput[] {
  const fields = Array.isArray(schema?.fields) ? schema.fields as InputSchemaField[] : [];
  const parsed = fields
    .map(parseInputField)
    .filter((field): field is SkillManifestInput => field !== null);
  return parsed.length ? parsed : [defaultPromptInput];
}

function parseInputField(field: InputSchemaField): SkillManifestInput | null {
  if (typeof field.name !== 'string' || !field.name.trim()) return null;
  const label = typeof field.label === 'string' && field.label.trim() ? field.label.trim() : titleCase(field.name);
  const type = parseInputType(field.type);
  const help = typeof field.helpText === 'string' && field.helpText.trim()
    ? field.helpText.trim()
    : typeof field.description === 'string' && field.description.trim()
      ? field.description.trim()
      : undefined;
  return {
    name: field.name.trim(),
    label,
    type,
    required: field.required !== false,
    ...(help ? { helpText: help } : {}),
  };
}

function parseInputType(value: unknown): SkillManifestInputType {
  if (value === 'text' || value === 'textarea' || value === 'number' || value === 'select' || value === 'boolean') return value;
  return 'text';
}

function parseManifestOutputs(contract: Record<string, unknown> | null): string[] {
  const artifacts = Array.isArray(contract?.artifacts)
    ? contract.artifacts.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
  const outputs = artifacts.length ? [...artifacts] : [...fallbackOutputs];
  if (contract?.savesToLibrary === true && !outputs.some((item) => /library|artifact/i.test(item))) {
    outputs.push('Saved library artifact');
  }
  return dedupe(outputs);
}

function collectCapabilities(readiness: SkillReadiness | null, required: boolean): string[] {
  if (!readiness) return [];
  return dedupe(readiness.dependencies
    .filter((dependency) => dependency.required === required)
    .map((dependency) => dependency.label.trim())
    .filter(Boolean));
}

function findLatestRun(skillSlug: string, runs: SkillRunSummary[]): SkillRunSummary | null {
  return runs
    .filter((run) => run.skillSlug === skillSlug)
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())[0] ?? null;
}

function safeMessage(dependency: SkillReadiness['dependencies'][number] | undefined, fallback: string): string {
  if (!dependency?.message || /[A-Z0-9_]{6,}|api[_ -]?key|secret|token|password/i.test(dependency.message)) return fallback;
  return dependency.message;
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function readinessToneClasses(tone: SkillManifestTone): string {
  const classes: Record<SkillManifestTone, string> = {
    success: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    warning: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    danger: 'border-red-400/30 bg-red-400/10 text-red-200',
    neutral: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  };
  return classes[tone];
}
