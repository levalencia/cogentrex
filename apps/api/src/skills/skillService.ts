import type { SkillSeed } from './skillRepository.js';
import { SkillRepository } from './skillRepository.js';
import { notFound } from '../http/errors.js';
import type { UpdateSkillInput, UpdateSkillRouteInput } from '@cogentrex/shared';
import type { AppLogger } from '../observability/logger.js';

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
    inputSchema: null,
    outputContract: null,
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
    inputSchema: null,
    outputContract: null,
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
    inputSchema: null,
    outputContract: null,
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
    inputSchema: null,
    outputContract: null,
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
    inputSchema: null,
    outputContract: null,
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
    inputSchema: null,
    outputContract: null,
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
    inputSchema: null,
    outputContract: null,
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

  async getVisible(slug: string) {
    const skill = await this.repository.findVisibleBySlug(slug);
    if (!skill) throw notFound('Skill not found');
    return skill;
  }

  listAll() {
    return this.repository.listAll();
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
}
