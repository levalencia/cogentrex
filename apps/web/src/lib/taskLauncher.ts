import type { AppMode, CapabilityStatus, PromptTemplate, SkillReadiness } from '@cogentrex/shared';

export type LauncherItemStatus = 'available' | 'near_existing';
export type LauncherItemTone = 'slate' | 'emerald' | 'blue' | 'purple' | 'pink' | 'amber';
export type LauncherItemKind = 'mode' | 'template';
export type SkillAssistMode = 'auto' | 'hybrid' | 'manual' | 'off';

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
  kind: LauncherItemKind;
  mode: AppMode;
  status: LauncherItemStatus;
  tone: LauncherItemTone;
  placeholder: string;
  capabilitySummary: LauncherCapabilitySummary;
  operatorNote: string;
  readiness?: LauncherReadinessBadge | undefined;
}

export interface TaskSelectionGroups {
  modes: LauncherItem[];
  taskTemplates: LauncherItem[];
}

export interface AdminConfigurationModelItem {
  label: 'Modes' | 'Task templates' | 'Skills';
  description: string;
  href: string;
}

export interface SkillAssistPickerOption {
  slug: string;
  label: string;
  description: string;
  group: string;
}

export interface SkillAssistModeOption {
  mode: SkillAssistMode;
  label: string;
  description: string;
}

export interface SkillAssistResolutionPreview {
  mode: SkillAssistMode;
  label: string;
  description: string;
  selectedLabels: string[];
  suggestedLabels: string[];
}

const skillAssistModeOptions: SkillAssistModeOption[] = [
  {
    mode: 'auto',
    label: 'Auto',
    description: 'Cogentrex chooses relevant published skills from the task prompt.',
  },
  {
    mode: 'hybrid',
    label: 'Hybrid',
    description: 'Pick one or two skills and let Cogentrex suggest the rest.',
  },
  {
    mode: 'manual',
    label: 'Manual',
    description: 'Pick the exact skills for this run.',
  },
  {
    mode: 'off',
    label: 'Off',
    description: 'Plain provider chat without skill instructions.',
  },
];

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
    label: 'Ask Cogentrex',
    eyebrow: 'General task',
    description: 'Ask a question, draft an output, or work with files and image context.',
    kind: 'mode',
    mode: 'CHAT',
    status: 'available',
    tone: 'slate',
    placeholder: 'What do you want Cogentrex to do?',
    capabilitySummary: {
      required: ['Text model'],
      optional: ['Vision', 'File context', 'Tool calling'],
      outputs: ['Answer', 'Saved artifact'],
    },
    operatorNote: 'This is the default task surface; providers, tools, and skills stay behind Skill Assist.',
  },
  {
    id: 'deep-research',
    label: 'Deep Research',
    eyebrow: 'Evidence loop',
    description: 'Research a question with sources, visible reasoning, and cited synthesis.',
    kind: 'mode',
    mode: 'DEEP_RESEARCH',
    status: 'available',
    tone: 'emerald',
    placeholder: 'What should Cogentrex research with sources?',
    capabilitySummary: {
      required: ['Text model', 'Web search'],
      optional: ['Source fetch', 'Streaming trace'],
      outputs: ['Cited answer', 'Saved artifact', 'Diagram-ready outline'],
    },
    operatorNote: 'Research uses capabilities and adapters; artifacts are reusable outputs, not separate tasks.',
  },
  {
    id: 'social-writer',
    label: 'LinkedIn / Social Writer',
    eyebrow: 'Publishable draft',
    description: 'Create platform-aware posts with optional mini research and image context.',
    kind: 'mode',
    mode: 'SOCIAL_WRITING',
    status: 'available',
    tone: 'blue',
    placeholder: 'Topic or idea for your social posts...',
    capabilitySummary: {
      required: ['Text model'],
      optional: ['Vision', 'Web research', 'LinkedIn publishing'],
      outputs: ['Platform drafts', 'Saved artifact'],
    },
    operatorNote: 'Social Writing drafts content first; publishing readiness remains separate from draft generation.',
  },
  {
    id: 'image-studio',
    label: 'Image Studio',
    eyebrow: 'Visual output',
    description: 'Generate or edit images with the configured image-capable provider.',
    kind: 'mode',
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
    kind: 'mode',
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
    id: 'algorithmic-art',
    label: 'Algorithmic Art',
    eyebrow: 'Template · Creative code',
    description: 'Prefill Chat with creative-code guidance for sketches, palettes, motion systems, and exportable art specs.',
    kind: 'template',
    mode: 'CHAT',
    status: 'available',
    tone: 'purple',
    placeholder: 'Describe the generative artwork, palette, motion, medium, and constraints...',
    capabilitySummary: {
      required: ['Chat mode', 'Text model'],
      optional: ['Algorithmic Art skill', 'Code artifact', 'Image prompt handoff'],
      outputs: ['Creative-code sketch', 'Prompt/spec artifact', 'Iteration plan'],
    },
    operatorNote: 'This is a task template inside Chat, not a separate workspace mode. Admins govern the underlying skill package separately.',
  },
  {
    id: 'artifact-brief',
    label: 'Brief / Artifact Writer',
    eyebrow: 'Template · Structured output',
    description: 'Turn a task result into a memo, brief, or reusable artifact.',
    kind: 'template',
    mode: 'CHAT',
    status: 'near_existing',
    tone: 'amber',
    placeholder: 'What brief, memo, or reusable output should Cogentrex create?',
    capabilitySummary: {
      required: ['Text model'],
      optional: ['Research context', 'Source citations'],
      outputs: ['Markdown artifact', 'Reusable brief'],
    },
    operatorNote: 'Artifact Writer is an output affordance on task results today, not a separate runtime engine.',
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
  return getLauncherItems().filter((item) => item.kind === 'mode');
}

export function getLauncherItem(id: string): LauncherItem | undefined {
  return getLauncherItems().find((item) => item.id === id);
}

export function getDefaultLauncherIdForMode(mode: AppMode): string {
  return getPrimaryLauncherItems().find((item) => item.mode === mode)?.id ?? 'ask-chat';
}

export function buildTaskSelectionGroups(items: LauncherItem[]): TaskSelectionGroups {
  return {
    modes: items.filter((item) => item.kind === 'mode'),
    taskTemplates: items.filter((item) => item.kind === 'template'),
  };
}

export function getAdminConfigurationModel(): AdminConfigurationModelItem[] {
  return [
    {
      label: 'Modes',
      description: 'Product-owned workspaces such as Chat, Deep Research, Social Writer, Image, and Video. Admins configure the providers and capabilities that make each mode ready.',
      href: '/settings/admin/providers',
    },
    {
      label: 'Task templates',
      description: 'Shortcuts that prefill a mode, prompt, and suggested skills. They are not new engines; they launch an existing mode with better defaults.',
      href: '/settings/admin/skills',
    },
    {
      label: 'Skills',
      description: 'Governed capability packages that Skill Assist can route into a run when Auto, Hybrid, or Manual is enabled.',
      href: '/settings/admin/skills',
    },
  ];
}

export function getLauncherSkillSlug(itemId: string): string | null {
  return launcherSkillSlugs[itemId] ?? null;
}

export function getSkillAssistPickerOptions(mode: AppMode, readiness: SkillReadiness[] = []): SkillAssistPickerOption[] {
  if (mode !== 'CHAT' && mode !== 'DEEP_RESEARCH') return [];
  const staticOptions = skillAssistPickerOptions.map((option) => ({ ...option }));
  const staticSlugs = new Set(staticOptions.map((option) => option.slug));
  const dynamicOptions = readiness.flatMap((item): SkillAssistPickerOption[] => {
    const skill = item.skill;
    if (skill.kind !== 'IMPORTED') return [];
    if (staticSlugs.has(skill.slug)) return [];
    const supportedModes = getSkillSupportedModesForAssist(skill);
    if (supportedModes.length > 0 && !supportedModes.includes(mode)) return [];
    return [{
      slug: skill.slug,
      label: skill.name,
      description: skill.description,
      group: skill.kind === 'IMPORTED' ? 'Skill packages' : 'Built-in skills',
    }];
  });
  return [...staticOptions, ...dynamicOptions.sort((left, right) => left.group.localeCompare(right.group) || left.label.localeCompare(right.label))];
}

function getSkillSupportedModesForAssist(skill: SkillReadiness['skill']): AppMode[] {
  const config = skill.route?.config;
  const value = config && typeof config === 'object' ? (config as Record<string, unknown>).supportedModes : undefined;
  if (Array.isArray(value)) {
    return value.filter((mode): mode is AppMode => typeof mode === 'string' && ['CHAT', 'DEEP_RESEARCH', 'SOCIAL_WRITING', 'IMAGE_GENERATION', 'VIDEO_GENERATION'].includes(mode));
  }
  return skill.route?.mode ? [skill.route.mode] : [];
}

export function getSkillAssistModeOptions(): SkillAssistModeOption[] {
  return skillAssistModeOptions.map((option) => ({ ...option }));
}

export function getSkillAssistSuggestionsForPrompt(prompt: string, mode: AppMode): SkillAssistPickerOption[] {
  const options = getSkillAssistPickerOptions(mode);
  if (!options.length) return [];

  const normalized = prompt.toLowerCase();
  if (!normalized.trim()) return [];

  const scores = new Map<string, number>();
  const add = (slug: string, score: number) => scores.set(slug, (scores.get(slug) ?? 0) + score);

  if (/\b(project|timeline|roadmap|milestone|milestones|gantt|sprint|delivery|plan|planning)\b/.test(normalized)) {
    add('project-management-coach', 4);
    add('scrum-delivery-planner', 2);
  }
  if (/\b(risk|risks|dependency|dependencies|stakeholder|scope)\b/.test(normalized)) {
    add('pmp-risk-register', 3);
    add('project-management-coach', 1);
  }
  if (/\b(diagram|chart|flow|flowchart|sequence|timeline|gantt|mermaid)\b/.test(normalized)) {
    add('mermaid-diagrams', normalized.includes('mermaid') ? 5 : 3);
  }
  if (/\b(excalidraw|whiteboard|sketch|hand-drawn|hand drawn|architecture diagram)\b/.test(normalized)) {
    add('excalidraw-diagramming', 4);
  }
  if (/\b(mockup|screen|ui|landing|html|prototype|design)\b/.test(normalized)) {
    add('claude-design', 3);
  }

  return options
    .map((option) => ({ option, score: scores.get(option.slug) ?? 0 }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label))
    .slice(0, 4)
    .map((item) => ({ ...item.option }));
}

export function previewSkillAssistResolution(input: {
  mode: SkillAssistMode;
  appMode: AppMode;
  prompt: string;
  selectedSkillSlugs: string[];
  launcherSkillSlug?: string | null;
}): SkillAssistResolutionPreview {
  const allOptions = getSkillAssistPickerOptions(input.appMode);
  const labelBySlug = new Map(allOptions.map((option) => [option.slug, option.label]));
  const launcherLabel = input.launcherSkillSlug ? labelBySlug.get(input.launcherSkillSlug) ?? input.launcherSkillSlug : null;
  const selectedSlugs = mergeSkillAssistSlugs(input.launcherSkillSlug, input.selectedSkillSlugs);
  const selectedLabels = selectedSlugs.map((slug) => labelBySlug.get(slug) ?? slug);
  const suggestedLabels = getSkillAssistSuggestionsForPrompt(input.prompt, input.appMode)
    .filter((option) => !selectedSlugs.includes(option.slug))
    .map((option) => option.label);

  if (input.mode === 'off') {
    return {
      mode: input.mode,
      label: 'Plain chat',
      description: 'No skill package instructions will be injected into this run.',
      selectedLabels: [],
      suggestedLabels: [],
    };
  }
  if (input.mode === 'manual') {
    return {
      mode: input.mode,
      label: selectedLabels.length ? `Manual: ${selectedLabels.join(' + ')}` : 'Manual: choose skills',
      description: selectedLabels.length
        ? 'Cogentrex will use only the skills you selected for this run.'
        : 'Pick one or more skills, or switch back to Auto if you want Cogentrex to decide.',
      selectedLabels,
      suggestedLabels: [],
    };
  }
  if (input.mode === 'hybrid') {
    return {
      mode: input.mode,
      label: selectedLabels.length ? `Hybrid: ${selectedLabels.join(' + ')} + suggestions` : 'Hybrid: choose skills + suggestions',
      description: selectedLabels.length
        ? 'Cogentrex will prioritize your selected skills and add relevant suggestions from the prompt.'
        : 'Pick one or two skills you already want; Cogentrex will suggest the rest from the task.',
      selectedLabels,
      suggestedLabels,
    };
  }

  return {
    mode: input.mode,
    label: launcherLabel ? `Auto + ${launcherLabel}` : 'Auto skill selection',
    description: launcherLabel
      ? 'Cogentrex will prioritize the selected task skill and may use other relevant published skills.'
      : 'Cogentrex will choose relevant published skills from your task prompt.',
    selectedLabels: launcherLabel ? [launcherLabel] : [],
    suggestedLabels,
  };
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
  return getLauncherItem(itemId)?.placeholder ?? 'What do you want Cogentrex to do?';
}

export function getLauncherPromptTemplates(itemId: string, readiness: SkillReadiness[]): PromptTemplate[] {
  const skillSlug = launcherReadinessSlugs[itemId];
  if (!skillSlug) return [];
  return getSkillPromptTemplates(skillSlug, readiness);
}

export function getSkillPromptTemplates(skillSlug: string, readiness: SkillReadiness[]): PromptTemplate[] {
  const templates = readiness.find((item) => item.skill.slug === skillSlug)?.skill.route?.config?.promptTemplates;
  return sanitizePromptTemplates(templates);
}

export function getSelectedSkillPromptTemplates(skillSlugs: string[], readiness: SkillReadiness[]): PromptTemplate[] {
  const seen = new Set<string>();
  return skillSlugs.flatMap((slug) => getSkillPromptTemplates(slug, readiness))
    .filter((template) => {
      if (seen.has(template.id)) return false;
      seen.add(template.id);
      return true;
    });
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
    const visibleToUsers = typeof candidate.visibleToUsers === 'boolean' ? candidate.visibleToUsers : true;
    if (!id || !label || !prompt.trim() || !visibleToUsers) return [];
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
    message: 'This mode or template is not enabled yet.',
  };
}
