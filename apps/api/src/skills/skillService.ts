import type { SkillSeed } from './skillRepository.js';
import { SkillRepository } from './skillRepository.js';
import { notFound, conflict } from '../http/errors.js';
import { importSkillKitFromGitHub } from './skillKitImporter.js';
import type { CreateSkillInput, ImportSkillKitInput, UpdateSkillInput, UpdateSkillInstructionsInput, UpdateSkillRouteInput } from '@cogentrex/shared';
import type { AppLogger } from '../observability/logger.js';

function promptInput(label = 'Prompt', helpText = 'Describe what this skill should do.'): Record<string, unknown> {
  return { fields: [{ name: 'prompt', label, type: 'textarea', required: true, helpText }] };
}

function outputContract(artifacts: string[], savesToLibrary = true): Record<string, unknown> {
  return { artifacts, savesToLibrary };
}

function promptTemplate(id: string, label: string, prompt: string, description?: string): Record<string, unknown> {
  return { id, label, prompt, ...(description ? { description } : {}) };
}

const promptTemplateSeeds: Record<string, Record<string, unknown>[]> = {
  chat: [
    promptTemplate('chat-decision-brief', 'Decision brief', 'Help me decide between these options. Compare tradeoffs, risks, costs, and give a clear recommendation: ', 'Structured recommendation for ambiguous choices.'),
    promptTemplate('chat-debug-help', 'Debug a problem', 'Diagnose this issue step by step. Ask only if required, otherwise give likely causes, evidence to check, and a minimal fix: ', 'Use for bugs, errors, and confusing behavior.'),
    promptTemplate('chat-draft-email', 'Draft message', 'Draft a concise, professional message for this situation. Keep it clear, direct, and ready to edit: ', 'Emails, Slack updates, and stakeholder notes.'),
    promptTemplate('chat-summarize', 'Summarize', 'Summarize the following into key points, decisions, risks, and next actions: ', 'Turn raw text into an actionable summary.'),
    promptTemplate('chat-artifact-spec', 'Create artifact', 'Create a polished artifact from this brief. Include structure, assumptions, and a version I can reuse: ', 'Use for memos, specs, plans, and reusable docs.'),
  ],
  'deep-research': [
    promptTemplate('research-market-map', 'Market map', 'Research this market. Identify segments, key players, buyer pain, current solutions, pricing signals, and credible source links: ', 'Market landscape with citations.'),
    promptTemplate('research-competitor-scan', 'Competitor scan', 'Research competitors for this product idea. Compare positioning, features, pricing, distribution, and gaps with source links: ', 'Competitive analysis.'),
    promptTemplate('research-technical-deep-dive', 'Technical deep dive', 'Research this technical topic. Explain current state, implementation options, tradeoffs, failure modes, and cite primary sources where possible: ', 'Engineering-oriented research.'),
    promptTemplate('research-vendor-shortlist', 'Vendor shortlist', 'Research vendors/tools for this use case. Build a shortlist with pros, cons, pricing clues, integration risks, and links: ', 'Tool/vendor selection.'),
    promptTemplate('research-claim-check', 'Claim check', 'Verify this claim using recent, reliable public sources. Separate confirmed facts, uncertainty, and conflicting evidence: ', 'Fact checking with evidence.'),
  ],
  'linkedin-writer': [
    promptTemplate('social-founder-update', 'Founder update', 'Write a founder-style LinkedIn post about this progress. Make it concrete, credible, and not hypey: ', 'Progress update with substance.'),
    promptTemplate('social-technical-lesson', 'Technical lesson', 'Write a LinkedIn post explaining this technical lesson for builders. Include the problem, mistake, fix, and takeaway: ', 'Practical engineering post.'),
    promptTemplate('social-product-point-of-view', 'Product POV', 'Write a thoughtful product point-of-view post about this trend. Keep it opinionated but evidence-aware: ', 'Market/product thought leadership.'),
    promptTemplate('social-launch-note', 'Launch note', 'Write a concise launch/update post for this feature. Explain who it helps, what changed, and what feedback I want: ', 'Feature announcement.'),
    promptTemplate('social-repurpose-research', 'Repurpose research', 'Turn this research into a LinkedIn thread/post. Preserve nuance, include useful specifics, and avoid generic AI language: ', 'Convert research into social content.'),
  ],
  'algorithmic-art': [
    promptTemplate('art-p5-sketch', 'p5.js sketch', 'Design a p5.js generative artwork. Specify visual system, palette, parameters, animation, and provide executable starter code: ', 'Creative-code starter.'),
    promptTemplate('art-poster-system', 'Poster system', 'Create a generative poster concept. Include composition rules, typography direction, palette, variations, and export notes: ', 'Poster/art direction.'),
    promptTemplate('art-shader-brief', 'Shader brief', 'Design a shader-based visual. Describe math/noise approach, color mapping, motion, controls, and implementation steps: ', 'Shader concept.'),
    promptTemplate('art-palette-study', 'Palette study', 'Create a generative art palette and motif study from this inspiration. Include constraints and iteration ideas: ', 'Palette and motifs.'),
    promptTemplate('art-interactive-piece', 'Interactive piece', 'Design an interactive browser artwork. Include user inputs, visual response, state model, and a minimal build plan: ', 'Interactive art concept.'),
  ],
  'image-studio': [
    promptTemplate('image-product-hero', 'Product hero', 'Create a high-quality product hero image prompt. Include subject, composition, lighting, background, style, and negative constraints: ', 'Commercial/product image.'),
    promptTemplate('image-editorial', 'Editorial image', 'Create an editorial illustration prompt for this concept. Make it visually distinctive, metaphorical, and publication-ready: ', 'Editorial illustration.'),
    promptTemplate('image-ui-mock', 'UI mockup', 'Create an image prompt for a polished SaaS UI mockup. Include layout, visual hierarchy, device/frame, and brand tone: ', 'SaaS/UI visual.'),
    promptTemplate('image-style-explore', 'Style exploration', 'Generate five visual style directions for this image idea, then write the strongest final prompt: ', 'Explore then choose.'),
    promptTemplate('image-iterate', 'Iterate image', 'Rewrite this image prompt to improve composition, realism, lighting, and specificity while preserving the core idea: ', 'Prompt refinement.'),
  ],
  'video-lab': [
    promptTemplate('video-product-demo', 'Product demo', 'Create a short product demo video prompt. Include scene sequence, camera motion, pacing, captions, and visual style: ', 'Short demo video.'),
    promptTemplate('video-cinematic-shot', 'Cinematic shot', 'Create a cinematic video prompt for this scene. Include subject, environment, camera movement, lighting, mood, and duration: ', 'Cinematic generation prompt.'),
    promptTemplate('video-social-ad', 'Social ad', 'Create a 10-second social ad video prompt. Include hook, visual beats, text overlays, and final frame: ', 'Short-form ad.'),
    promptTemplate('video-explainer', 'Explainer', 'Create a concise explainer video prompt. Include storyboard beats, motion graphics style, narration cues, and transitions: ', 'Explainer storyboard.'),
    promptTemplate('video-iterate', 'Iterate video', 'Improve this video prompt for continuity, motion, camera clarity, and generation reliability: ', 'Prompt refinement.'),
  ],
  'artifact-writer': [
    promptTemplate('artifact-prd', 'PRD', 'Create a compact PRD for this feature. Include problem, target user, requirements, non-goals, risks, and acceptance criteria: ', 'Product requirements.'),
    promptTemplate('artifact-runbook', 'Runbook', 'Create an operational runbook. Include symptoms, checks, commands, rollback, escalation, and verification: ', 'Ops/runbook artifact.'),
    promptTemplate('artifact-implementation-plan', 'Implementation plan', 'Create an implementation plan with small tasks, affected files, tests, risks, and rollout steps: ', 'Engineering plan.'),
    promptTemplate('artifact-meeting-brief', 'Meeting brief', 'Create a meeting brief with context, agenda, decisions needed, open questions, and follow-ups: ', 'Meeting prep.'),
    promptTemplate('artifact-decision-record', 'Decision record', 'Create an ADR-style decision record. Include context, options, decision, consequences, and review date: ', 'Architecture/product decision.'),
  ],
  'project-management': [
    promptTemplate('pm-scope-plan', 'Scope plan', 'Turn this project brief into scope, milestones, owners, risks, and acceptance criteria: ', 'Planning from a rough brief.'),
    promptTemplate('pm-sprint-plan', 'Sprint plan', 'Create a focused sprint plan. Include goal, backlog items, dependencies, risks, and demo criteria: ', 'Scrum/sprint planning.'),
    promptTemplate('pm-risk-review', 'Risk review', 'Review this delivery plan for risks, missing assumptions, blockers, and mitigation actions: ', 'Delivery risk scan.'),
    promptTemplate('pm-retro', 'Retro prep', 'Prepare a practical retrospective from this context. Identify what worked, what failed, themes, and experiments: ', 'Retrospective structure.'),
    promptTemplate('pm-stakeholder-update', 'Stakeholder update', 'Draft a clear stakeholder update with progress, decisions needed, risks, and next steps: ', 'Execution communication.'),
  ],
  'flight-search': [
    promptTemplate('travel-flight-options', 'Flight options', 'Research flight options for this trip. Include likely airlines/routes, booking links, timing tradeoffs, baggage caveats, and current-source links: ', 'Flight research.'),
    promptTemplate('travel-trip-plan', 'Trip plan', 'Research and draft a practical trip plan. Include transport, accommodation areas, daily constraints, budget notes, and links: ', 'Travel planning.'),
    promptTemplate('travel-family-itinerary', 'Family itinerary', 'Research a family-friendly itinerary for these dates and constraints. Include kid-friendly pacing, logistics, and links: ', 'Family travel.'),
    promptTemplate('travel-visa-entry', 'Visa / entry check', 'Research visa, entry, transit, and document requirements for this itinerary. Cite official sources first: ', 'Travel requirements.'),
    promptTemplate('travel-price-watch', 'Price watch brief', 'Research current travel price signals and suggest what to monitor, when to book, and which routes/sites to check: ', 'Price monitoring.'),
  ],
};

function routeConfig(slug: string, extra: Record<string, unknown> | null = null): Record<string, unknown> {
  return { ...(extra ?? {}), promptTemplates: promptTemplateSeeds[slug] ?? [] };
}

export const nativeSkillSeeds: SkillSeed[] = [
  {
    id: 'skl_chat',
    slug: 'chat',
    name: 'Chat',
    description: 'General-purpose assistant chat for everyday work.',
    kind: 'NATIVE',
    status: 'PUBLISHED',
    visibility: 'USER_VISIBLE',
    category: 'Core',
    icon: 'message-circle',
    inputSchema: promptInput('Message', 'Ask for an answer, analysis, draft, or artifact.'),
    outputContract: outputContract(['Answer', 'Saved artifact']),
    toolRequirements: [],
    route: { id: 'skr_chat', mode: 'CHAT', defaultProviderId: null, searchProfile: null, maxBudgetCents: null, config: routeConfig('chat') },
  },
  {
    id: 'skl_deep_research',
    slug: 'deep-research',
    name: 'Deep Research',
    description: 'Source-grounded research with citations, reasoning, and diagnostics.',
    kind: 'NATIVE',
    status: 'PUBLISHED',
    visibility: 'USER_VISIBLE',
    category: 'Research',
    icon: 'search',
    inputSchema: { fields: [
      { name: 'question', label: 'Research question', type: 'textarea', required: true, helpText: 'Ask a bounded research question that needs live sources.' },
      { name: 'sourceLimit', label: 'Source limit', type: 'number', required: false, helpText: 'Optional target number of sources to consult.' },
    ] },
    outputContract: outputContract(['Cited answer', 'Source list', 'Reasoning trace']),
    toolRequirements: [{ name: 'web.search', required: true, description: 'Discover live public sources' }],
    route: { id: 'skr_deep_research', mode: 'DEEP_RESEARCH', defaultProviderId: null, searchProfile: 'default-web', maxBudgetCents: null, config: routeConfig('deep-research') },
  },
  {
    id: 'skl_linkedin_writer',
    slug: 'linkedin-writer',
    name: 'LinkedIn Writer',
    description: 'Draft professional posts using research context and social account settings.',
    kind: 'NATIVE',
    status: 'PUBLISHED',
    visibility: 'USER_VISIBLE',
    category: 'Social',
    icon: 'linkedin',
    inputSchema: promptInput('Topic or draft brief', 'Describe the post idea, audience, and angle.'),
    outputContract: outputContract(['Platform draft', 'Research context', 'Saved artifact']),
    toolRequirements: [],
    route: { id: 'skr_linkedin_writer', mode: 'SOCIAL_WRITING', defaultProviderId: null, searchProfile: null, maxBudgetCents: null, config: routeConfig('linkedin-writer') },
  },
  {
    id: 'skl_algorithmic_art',
    slug: 'algorithmic-art',
    name: 'Algorithmic Art',
    description: 'Skill-assisted creative-code workflow for generative art, palettes, motion, and exportable sketches.',
    kind: 'NATIVE',
    status: 'PUBLISHED',
    visibility: 'USER_VISIBLE',
    category: 'Creative',
    icon: 'sparkles',
    inputSchema: promptInput('Artwork brief', 'Describe the generative artwork, palette, motion, medium, and constraints.'),
    outputContract: outputContract(['Creative-code sketch', 'Prompt/spec artifact', 'Iteration plan']),
    toolRequirements: [],
    route: {
      id: 'skr_algorithmic_art',
      mode: 'CHAT',
      defaultProviderId: null,
      searchProfile: null,
      maxBudgetCents: null,
      config: routeConfig('algorithmic-art', {
        skillAssist: {
          keywords: ['algorithmic art', 'generative art', 'creative code', 'p5.js', 'processing', 'canvas', 'shader', 'palette', 'motion'],
          instructions: [
            'Generate executable creative-code artifacts or precise implementation specs, not vague visual adjectives.',
            'Keep the first version small: one coherent system, clear parameters, and a short iteration plan.',
          ],
        },
      }),
    },
  },
  {
    id: 'skl_image_studio',
    slug: 'image-studio',
    name: 'Image Studio',
    description: 'Generate and iterate on images through configured media providers.',
    kind: 'NATIVE',
    status: 'PUBLISHED',
    visibility: 'USER_VISIBLE',
    category: 'Media',
    icon: 'image',
    inputSchema: promptInput('Image prompt', 'Describe the image, style, composition, and constraints.'),
    outputContract: outputContract(['Image artifact', 'Prompt notes']),
    toolRequirements: [],
    route: { id: 'skr_image_studio', mode: 'IMAGE_GENERATION', defaultProviderId: null, searchProfile: null, maxBudgetCents: null, config: routeConfig('image-studio') },
  },
  {
    id: 'skl_video_lab',
    slug: 'video-lab',
    name: 'Video Lab',
    description: 'Staged video generation workflow for future media providers.',
    kind: 'NATIVE',
    status: 'STAGED',
    visibility: 'ADMIN_ONLY',
    category: 'Media',
    icon: 'video',
    inputSchema: promptInput('Video prompt', 'Describe the short video, camera movement, and visual style.'),
    outputContract: outputContract(['Video artifact', 'Storyboard notes']),
    toolRequirements: [],
    route: { id: 'skr_video_lab', mode: 'VIDEO_GENERATION', defaultProviderId: null, searchProfile: null, maxBudgetCents: null, config: routeConfig('video-lab') },
  },
  {
    id: 'skl_project_management',
    slug: 'project-management',
    name: 'Project Management Coach',
    description: 'Skill-assisted planning, Scrum rituals, delivery risk review, and execution checklists for chat or research-backed planning.',
    kind: 'NATIVE',
    status: 'PUBLISHED',
    visibility: 'USER_VISIBLE',
    category: 'Operations',
    icon: '📋',
    inputSchema: promptInput('Project brief', 'Describe the project, team, deadline, risks, and delivery context.'),
    outputContract: outputContract(['Execution plan', 'Risk register', 'Scrum checklist']),
    toolRequirements: [{ name: 'web.search', required: false, description: 'Optional live research for market, vendor, or methodology references' }],
    route: {
      id: 'skr_project_management',
      mode: 'CHAT',
      defaultProviderId: null,
      searchProfile: null,
      maxBudgetCents: null,
      config: routeConfig('project-management', {
        supportedModes: ['CHAT', 'DEEP_RESEARCH'],
        skillAssist: {
          keywords: ['project management', 'scrum', 'sprint', 'retro', 'roadmap', 'delivery risk', 'backlog', 'stakeholder'],
          instructions: [
            'Turn vague project goals into scope, milestones, risks, owners, and acceptance criteria.',
            'Use Deep Research mode only when the plan depends on current sources, frameworks, vendors, or market facts.',
          ],
        },
      }),
    },
  },
  {
    id: 'skl_artifact_writer',
    slug: 'artifact-writer',
    name: 'Artifact Writer',
    description: 'Create structured text, code, and HTML artifacts from chat.',
    kind: 'NATIVE',
    status: 'PUBLISHED',
    visibility: 'USER_VISIBLE',
    category: 'Creation',
    icon: 'file-text',
    inputSchema: promptInput('Artifact brief', 'Describe the reusable output you want Cogentrex to draft.'),
    outputContract: outputContract(['Markdown artifact', 'Reusable brief']),
    toolRequirements: [],
    route: { id: 'skr_artifact_writer', mode: 'CHAT', defaultProviderId: null, searchProfile: null, maxBudgetCents: null, config: routeConfig('artifact-writer', { artifacts: true }) },
  },
  {
    id: 'skl_flight_search',
    slug: 'flight-search',
    name: 'Flight Search',
    description: 'Staged travel research workflow using web search and citation links.',
    kind: 'NATIVE',
    status: 'STAGED',
    visibility: 'ADMIN_ONLY',
    category: 'Travel',
    icon: 'plane',
    inputSchema: { fields: [
      { name: 'tripBrief', label: 'Trip brief', type: 'textarea', required: true, helpText: 'Include route, dates, passenger count, budget, and constraints.' },
      { name: 'sourceLimit', label: 'Source limit', type: 'number', required: false },
    ] },
    outputContract: outputContract(['Travel research summary', 'Source links']),
    toolRequirements: [{ name: 'web.search', required: true, description: 'Find current travel results' }],
    route: { id: 'skr_flight_search', mode: 'DEEP_RESEARCH', defaultProviderId: null, searchProfile: 'travel-web', maxBudgetCents: null, config: routeConfig('flight-search') },
  },
];

export class SkillService {
  constructor(
    private readonly repository: SkillRepository,
    private readonly logger: AppLogger,
  ) {}

  async seedNativeSkills(): Promise<void> {
    await this.repository.seedNative(nativeSkillSeeds);
    this.logger.info({ count: nativeSkillSeeds.length }, 'skills_seeded');
  }

  listVisible() {
    return this.repository.listVisible();
  }

  listVisibleDetails() {
    return this.repository.listVisibleDetails();
  }

  async getVisible(slug: string) {
    const skill = await this.repository.findVisibleBySlug(slug);
    if (!skill) throw notFound('Skill not found');
    return skill;
  }

  listAll() {
    return this.repository.listAll();
  }

  async getAdmin(slug: string) {
    const skill = await this.repository.findBySlug(slug);
    if (!skill) throw notFound('Skill not found');
    return skill;
  }

  async listFiles(slug: string) {
    const files = await this.repository.listFilesBySkillSlug(slug);
    if (!files) throw notFound('Skill not found');
    return files;
  }

  async createSkill(input: CreateSkillInput) {
    const result = await this.repository.createManualImportedSkill(input);
    if (!result) throw conflict('Skill slug already exists');
    this.logger.info({ slug: result.skill.slug, fileCount: result.files.length }, 'skill_created_manually');
    return result;
  }

  async updateSkill(slug: string, input: UpdateSkillInput) {
    const skill = await this.repository.updateSkill(slug, input);
    if (!skill) throw notFound('Skill not found');
    this.logger.info({ slug, status: skill.status, visibility: skill.visibility }, 'skill_updated');
    return skill;
  }

  async updateSkillInstructions(slug: string, input: UpdateSkillInstructionsInput) {
    const files = await this.repository.updateSkillInstructions(slug, input);
    if (!files) throw notFound('Skill not found');
    this.logger.info({ slug }, 'skill_instructions_updated');
    return files;
  }

  async updateRoute(slug: string, input: UpdateSkillRouteInput) {
    const route = await this.repository.upsertRoute(slug, input);
    if (!route) throw notFound('Skill not found');
    this.logger.info({ slug, mode: route.mode, searchProfile: route.searchProfile }, 'skill_route_updated');
    return route;
  }

  async recordAdminTestGate(slug: string, input: Parameters<SkillRepository['recordAdminTestGate']>[1]) {
    const route = await this.repository.recordAdminTestGate(slug, input);
    if (!route) throw notFound('Skill route not found');
    this.logger.info({ slug, runId: input.runId }, 'skill_admin_test_gate_recorded');
    return route;
  }

  async importSkillKit(input: ImportSkillKitInput) {
    const snapshot = await importSkillKitFromGitHub(input);
    const result = await this.repository.importSkillKit(snapshot);
    if (!result) throw conflict('Imported skill slug conflicts with an existing native skill');
    this.logger.info({ slug: result.skill.slug, fileCount: result.files.length, sourcePath: snapshot.sourcePath }, 'skill_kit_imported');
    return result;
  }

  async reimportSkillKit(slug: string) {
    const skill = await this.repository.findBySlug(slug);
    if (!skill || skill.kind !== 'IMPORTED') throw notFound('Imported skill not found');
    const source = await this.repository.getImportSource(slug);
    if (!source) throw notFound('Import source not found for this skill');
    const snapshot = await importSkillKitFromGitHub(source);
    const result = await this.repository.importSkillKit({ ...snapshot, slug: skill.slug });
    if (!result) throw conflict('Could not refresh imported skill kit');
    this.logger.info({ slug: result.skill.slug, fileCount: result.files.length, sourcePath: snapshot.sourcePath }, 'skill_kit_reimported');
    return result;
  }
}
