import type { SkillSeed } from './skillRepository.js';
import { SkillRepository } from './skillRepository.js';
import { notFound, conflict } from '../http/errors.js';
import { importSkillKitFromGitHub } from './skillKitImporter.js';
import type { CreateSkillInput, ImportSkillKitInput, UpdateSkillInput, UpdateSkillRouteInput } from '@cogentrex/shared';
import type { AppLogger } from '../observability/logger.js';

function promptInput(label = 'Prompt', helpText = 'Describe what this skill should do.'): Record<string, unknown> {
  return { fields: [{ name: 'prompt', label, type: 'textarea', required: true, helpText }] };
}

function outputContract(artifacts: string[], savesToLibrary = true): Record<string, unknown> {
  return { artifacts, savesToLibrary };
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
    route: { id: 'skr_chat', mode: 'CHAT', defaultProviderId: null, searchProfile: null, maxBudgetCents: null, config: null },
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
    route: { id: 'skr_deep_research', mode: 'DEEP_RESEARCH', defaultProviderId: null, searchProfile: 'default-web', maxBudgetCents: null, config: null },
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
    route: { id: 'skr_linkedin_writer', mode: 'SOCIAL_WRITING', defaultProviderId: null, searchProfile: null, maxBudgetCents: null, config: null },
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
    route: { id: 'skr_image_studio', mode: 'IMAGE_GENERATION', defaultProviderId: null, searchProfile: null, maxBudgetCents: null, config: null },
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
    route: { id: 'skr_video_lab', mode: 'VIDEO_GENERATION', defaultProviderId: null, searchProfile: null, maxBudgetCents: null, config: null },
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
    route: { id: 'skr_artifact_writer', mode: 'CHAT', defaultProviderId: null, searchProfile: null, maxBudgetCents: null, config: { artifacts: true } },
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
    route: { id: 'skr_flight_search', mode: 'DEEP_RESEARCH', defaultProviderId: null, searchProfile: 'travel-web', maxBudgetCents: null, config: null },
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

  async updateRoute(slug: string, input: UpdateSkillRouteInput) {
    const route = await this.repository.upsertRoute(slug, input);
    if (!route) throw notFound('Skill not found');
    this.logger.info({ slug, mode: route.mode, searchProfile: route.searchProfile }, 'skill_route_updated');
    return route;
  }

  async importSkillKit(input: ImportSkillKitInput) {
    const snapshot = await importSkillKitFromGitHub(input);
    const result = await this.repository.importSkillKit(snapshot);
    if (!result) throw conflict('Imported skill slug conflicts with an existing native skill');
    this.logger.info({ slug: result.skill.slug, fileCount: result.files.length, sourcePath: snapshot.sourcePath }, 'skill_kit_imported');
    return result;
  }
}
