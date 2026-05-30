import type { AppMode, CapabilityStatus, PromptTemplate, SkillReadiness } from '@cogentrex/shared';

export type LauncherItemStatus = 'available' | 'near_existing';
export type LauncherItemTone = 'slate' | 'emerald' | 'blue' | 'purple' | 'pink' | 'amber';

export interface LauncherReadinessBadge {
  status: CapabilityStatus | 'unconfigured';
  label: string;
  message: string;
}

export interface LauncherReadinessSummary {
  ready: number;
  degraded: number;
  missing: number;
  unconfigured: number;
}

export interface LauncherCapabilitySummary {
  required: string[];
  optional: string[];
  outputs: string[];
}

export interface LauncherItem {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  mode: AppMode;
  status: LauncherItemStatus;
  tone: LauncherItemTone;
  placeholder: string;
  capabilitySummary: LauncherCapabilitySummary;
  operatorNote: string;
  readiness?: LauncherReadinessBadge | undefined;
}

export interface WorkflowSelectionGroups {
  primaryWorkflows: LauncherItem[];
  outputAffordances: LauncherItem[];
}

export interface SkillAssistPickerOption {
  slug: string;
  label: string;
  description: string;
  group: 'Project management' | 'Visual & diagrams';
}

const skillAssistPickerOptions: SkillAssistPickerOption[] = [
  {
    slug: 'scrum-delivery-planner',
    label: 'Scrum planner',
    description: 'Sprint slices, stories, and acceptance criteria.',
    group: 'Project management',
  },
  {
    slug: 'project-management-coach',
    label: 'PM coach',
    description: 'Scope, stakeholders, risks, dependencies, and next actions.',
    group: 'Project management',
  },
  {
    slug: 'pmp-risk-register',
    label: 'Risk register',
    description: 'Risks, owners, triggers, mitigations, and contingency plans.',
    group: 'Project management',
  },
  {
    slug: 'excalidraw-diagramming',
    label: 'Excalidraw',
    description: 'Hand-drawn architecture, flow, and whiteboard diagrams.',
    group: 'Visual & diagrams',
  },
  {
    slug: 'mermaid-diagrams',
    label: 'Mermaid',
    description: 'Renderable flowcharts, sequence diagrams, state charts, and maps.',
    group: 'Visual & diagrams',
  },
  {
    slug: 'claude-design',
    label: 'Design artifact',
    description: 'Polished HTML mockups, product screens, and visual specs.',
    group: 'Visual & diagrams',
  },
];

const launcherItems: LauncherItem[] = [
  {
    id: 'ask-chat',
    label: 'Ask / Chat',
    eyebrow: 'Fast answer',
    description: 'Provider-routed answers, files, image context, and artifact drafting.',
    mode: 'CHAT',
    status: 'available',
    tone: 'slate',
    placeholder: 'Ask Cogentrex... (Press Enter to send)',
    capabilitySummary: {
      required: ['Text model'],
      optional: ['Vision', 'File context', 'Tool calling'],
      outputs: ['Answer', 'Saved artifact'],
    },
    operatorNote: 'Chat is the general workflow surface; providers and tools stay behind routing.',
  },
  {
    id: 'algorithmic-art',
    label: 'Algorithmic Art',
    eyebrow: 'Creative code',
    description: 'Generate creative-code sketches, palettes, motion systems, and exportable art specs.',
    mode: 'CHAT',
    status: 'available',
    tone: 'purple',
    placeholder: 'Describe the generative artwork, palette, motion, medium, and constraints...',
    capabilitySummary: {
      required: ['Text model'],
      optional: ['Code artifact', 'Image prompt handoff', 'Motion notes'],
      outputs: ['Creative-code sketch', 'Prompt/spec artifact', 'Iteration plan'],
    },
    operatorNote: 'Algorithmic Art is a skill-assisted Chat launcher for creative-code guidance; it does not add a separate runtime engine.',
  },
  {
    id: 'deep-research',
    label: 'Deep Research',
    eyebrow: 'Evidence loop',
    description: 'Plan searches, gather sources, show reasoning, and synthesize citations.',
    mode: 'DEEP_RESEARCH',
    status: 'available',
    tone: 'emerald',
    placeholder: 'What should Cogentrex research with sources?',
    capabilitySummary: {
      required: ['Text model', 'Web search'],
      optional: ['Source fetch', 'Streaming trace'],
      outputs: ['Cited answer', 'Saved artifact', 'Diagram-ready outline'],
    },
    operatorNote: 'Research uses capabilities and adapters; diagram or artifact output is an output affordance, not a separate research engine.',
  },
  {
    id: 'social-writer',
    label: 'LinkedIn / Social Writer',
    eyebrow: 'Publishable draft',
    description: 'Create platform-aware posts with optional mini research and image context.',
    mode: 'SOCIAL_WRITING',
    status: 'available',
    tone: 'blue',
    placeholder: 'Topic or idea for your social posts...',
    capabilitySummary: {
      required: ['Text model'],
      optional: ['Vision', 'Web research', 'LinkedIn publishing'],
      outputs: ['Platform drafts', 'Saved artifact'],
    },
    operatorNote: 'Social Writing drafts content first; OAuth publishing readiness remains separate from draft generation.',
  },
  {
    id: 'image-studio',
    label: 'Image Studio',
    eyebrow: 'Visual output',
    description: 'Generate or edit images with the configured image-capable provider.',
    mode: 'IMAGE_GENERATION',
    status: 'available',
    tone: 'purple',
    placeholder: 'Describe the image you want to generate...',
    capabilitySummary: {
      required: ['Image provider'],
      optional: ['Text prompt enhancement', 'Vision context'],
      outputs: ['Image artifact', 'Prompt notes'],
    },
    operatorNote: 'Image Studio requires an image-capable provider; prompt enhancement is optional.',
  },
  {
    id: 'video-studio',
    label: 'Video Studio',
    eyebrow: 'Motion output',
    description: 'Generate short videos with the configured video-capable provider.',
    mode: 'VIDEO_GENERATION',
    status: 'available',
    tone: 'pink',
    placeholder: 'Describe the video you want to generate...',
    capabilitySummary: {
      required: ['Video provider'],
      optional: ['Text prompt enhancement'],
      outputs: ['Video artifact', 'Storyboard notes'],
    },
    operatorNote: 'Video Studio is provider-backed and should degrade clearly when no video provider is configured.',
  },
  {
    id: 'artifact-brief',
    label: 'Brief / Artifact Writer',
    eyebrow: 'Structured output',
    description: 'Draft memos, briefs, and reusable outputs from the chat workspace.',
    mode: 'CHAT',
    status: 'near_existing',
    tone: 'amber',
    placeholder: 'What brief, memo, or artifact should Cogentrex draft?',
    capabilitySummary: {
      required: ['Text model'],
      optional: ['Research context', 'Source citations'],
      outputs: ['Markdown artifact', 'Reusable brief'],
    },
    operatorNote: 'Artifact Writer is an output affordance on Chat today, not a separate runtime engine.',
  },
];

const launcherSkillSlugs: Record<string, string> = {
  'algorithmic-art': 'algorithmic-art',
};

const launcherReadinessSlugs: Record<string, string> = {
  'ask-chat': 'chat',
  'algorithmic-art': 'algorithmic-art',
  'deep-research': 'deep-research',
  'social-writer': 'linkedin-writer',
  'image-studio': 'image-studio',
  'artifact-brief': 'artifact-writer',
};

export function getLauncherItems(): LauncherItem[] {
  return launcherItems.map((item) => ({ ...item }));
}

export function getPrimaryLauncherItems(): LauncherItem[] {
  return getLauncherItems().filter((item) => item.status === 'available');
}

export function getLauncherItem(id: string): LauncherItem | undefined {
  return getLauncherItems().find((item) => item.id === id);
}

export function getDefaultLauncherIdForMode(mode: AppMode): string {
  return getPrimaryLauncherItems().find((item) => item.mode === mode)?.id ?? 'ask-chat';
}

export function buildWorkflowSelectionGroups(items: LauncherItem[]): WorkflowSelectionGroups {
  return {
    primaryWorkflows: items.filter((item) => item.status === 'available'),
    outputAffordances: items.filter((item) => item.status === 'near_existing'),
  };
}

export function getLauncherSkillSlug(itemId: string): string | null {
  return launcherSkillSlugs[itemId] ?? null;
}

export function getSkillAssistPickerOptions(mode: AppMode): SkillAssistPickerOption[] {
  if (mode !== 'CHAT' && mode !== 'DEEP_RESEARCH') return [];
  return skillAssistPickerOptions.map((option) => ({ ...option }));
}

export function mergeSkillAssistSlugs(...groups: Array<string | string[] | null | undefined>): string[] {
  const merged: string[] = [];
  for (const group of groups) {
    const slugs = Array.isArray(group) ? group : (group ? [group] : []);
    for (const slug of slugs) {
      const trimmed = slug.trim();
      if (trimmed && !merged.includes(trimmed)) merged.push(trimmed);
    }
  }
  return merged;
}

export function getLauncherPlaceholder(itemId: string): string {
  return getLauncherItem(itemId)?.placeholder ?? 'Ask Cogentrex... (Press Enter to send)';
}

export function getLauncherPromptTemplates(itemId: string, readiness: SkillReadiness[]): PromptTemplate[] {
  const skillSlug = launcherReadinessSlugs[itemId];
  if (!skillSlug) return [];
  const templates = readiness.find((item) => item.skill.slug === skillSlug)?.skill.route?.config?.promptTemplates;
  return sanitizePromptTemplates(templates);
}

function sanitizePromptTemplates(value: unknown): PromptTemplate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const prompt = typeof candidate.prompt === 'string' ? candidate.prompt : '';
    const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
    if (!id || !label || !prompt.trim()) return [];
    return [{ id, label, prompt, ...(description ? { description } : {}) }];
  }).slice(0, 8);
}

export function getLauncherToneClasses(tone: LauncherItemTone, active: boolean): string {
  if (!active) return 'border-line bg-panel/40 text-slate-400 hover:border-slate-600 hover:text-slate-200';
  const activeClasses: Record<LauncherItemTone, string> = {
    slate: 'border-slate-200 bg-slate-100 text-ink',
    emerald: 'border-emerald-500/30 bg-emerald-500/20 text-emerald-100',
    blue: 'border-blue-500/30 bg-blue-500/20 text-blue-100',
    purple: 'border-purple-500/30 bg-purple-500/20 text-purple-100',
    pink: 'border-pink-500/30 bg-pink-500/20 text-pink-100',
    amber: 'border-amber-500/30 bg-amber-500/20 text-amber-100',
  };
  return activeClasses[tone];
}

export function applyLauncherReadiness(items: LauncherItem[], readiness: SkillReadiness[]): LauncherItem[] {
  const readinessBySlug = new Map(readiness.map((item) => [item.skill.slug, item]));
  return items.map((item) => {
    const skillSlug = launcherReadinessSlugs[item.id];
    const skillReadiness = skillSlug ? readinessBySlug.get(skillSlug) : undefined;
    return {
      ...item,
      readiness: skillReadiness ? summarizeReadiness(skillReadiness) : unconfiguredReadiness(),
    };
  });
}

export function getReadinessBadgeClasses(status: LauncherReadinessBadge['status']): string {
  const classes: Record<LauncherReadinessBadge['status'], string> = {
    ready: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    degraded: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    missing: 'border-red-400/30 bg-red-400/10 text-red-200',
    unconfigured: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  };
  return classes[status];
}

export function summarizeLauncherReadiness(items: LauncherItem[]): LauncherReadinessSummary {
  return items.reduce<LauncherReadinessSummary>((summary, item) => {
    const status = item.readiness?.status ?? 'unconfigured';
    summary[status] += 1;
    return summary;
  }, { ready: 0, degraded: 0, missing: 0, unconfigured: 0 });
}

function summarizeReadiness(readiness: SkillReadiness): LauncherReadinessBadge {
  if (readiness.status === 'ready') {
    return { status: 'ready', label: 'Ready', message: 'Ready to launch.' };
  }
  const dependency = readiness.dependencies.find((item) => item.status !== 'ready');
  return {
    status: readiness.status,
    label: readiness.status === 'missing' ? 'Needs setup' : 'Limited',
    message: safeDependencyMessage(readiness.status, dependency),
  };
}

function safeDependencyMessage(status: CapabilityStatus, dependency: SkillReadiness['dependencies'][number] | undefined): string {
  if (!dependency) {
    return status === 'missing' ? 'Required provider or tool configuration is missing.' : 'Some optional capability is unavailable.';
  }
  const label = dependency.label.trim() || (dependency.kind === 'tool' ? 'tool' : 'provider');
  const isOptional = !dependency.required || status === 'degraded';
  if (dependency.kind === 'tool' && dependency.id === 'web.search') {
    return isOptional ? 'Optional web search capability is unavailable.' : 'Required web search setup is missing.';
  }
  if (dependency.kind === 'provider' && dependency.id === 'vision') {
    return isOptional ? 'Optional vision capability is unavailable.' : 'Required vision provider setup is missing.';
  }
  if (dependency.message && !/[A-Z0-9_]{6,}|api[_ -]?key|secret|token|password/i.test(dependency.message)) {
    return dependency.message;
  }
  return `${isOptional ? 'Optional' : 'Required'} ${label.toLowerCase()} ${dependency.kind} is ${status === 'missing' ? 'missing' : 'unavailable'}.`;
}

function unconfiguredReadiness(): LauncherReadinessBadge {
  return {
    status: 'unconfigured',
    label: 'Not enabled',
    message: 'This workflow is not enabled yet.',
  };
}
