import { createHash } from 'node:crypto';
import type {
  AppMode,
  CreateSkillInput,
  SkillDetail,
  SkillFileKind,
  SkillFileSummary,
  SkillKind,
  SkillProviderRoute,
  SkillProviderRouteConfig,
  SkillPublishGateLastTest,
  SkillStatus,
  SkillSummary,
  SkillToolRequirement,
  SkillVisibility,
  UpdateSkillInput,
  UpdateSkillFileInput,
  UpdateSkillInstructionsInput,
  UpdateSkillRouteInput,
} from '@cogentrex/shared';
import type { DbAdapter } from '../db/adapter.js';
export type { SkillFileKind } from '@cogentrex/shared';

export interface ImportedSkillFile {
  id: string;
  path: string;
  kind: SkillFileKind;
  content: string;
  contentType: string;
  sha256: string;
  sizeBytes: number;
  executable: boolean;
}

export interface ImportedSkillKitSnapshot {
  id: string;
  slug: string;
  name: string;
  description: string;
  sourceKind?: 'github' | 'manual' | undefined;
  sourceUrl: string;
  sourceRef: string;
  sourcePath: string;
  sourceLabel?: string | undefined;
  files: ImportedSkillFile[];
  warnings: string[];
}

export interface ImportedSkillKitResult {
  skill: SkillDetail;
  files: ImportedSkillFile[];
  warnings: string[];
}

export interface SkillSeed {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: SkillKind;
  status: SkillStatus;
  visibility: SkillVisibility;
  category: string | null;
  icon: string | null;
  inputSchema: Record<string, unknown> | null;
  outputContract: Record<string, unknown> | null;
  toolRequirements: SkillToolRequirement[];
  route: {
    id: string;
    mode: AppMode;
    defaultProviderId: string | null;
    searchProfile: string | null;
    maxBudgetCents: number | null;
    config: Record<string, unknown> | null;
  };
}

interface SkillRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: SkillKind;
  status: SkillStatus;
  visibility: SkillVisibility;
  category: string | null;
  icon: string | null;
  input_schema_json: string | null;
  output_contract_json: string | null;
  tool_requirements_json: string | null;
  created_at: string;
  updated_at: string;
  route_id: string | null;
  route_skill_id: string | null;
  route_mode: AppMode | null;
  route_default_provider_id: string | null;
  route_search_profile: string | null;
  route_max_budget_cents: number | null;
  route_config_json: string | null;
  route_created_at: string | null;
  route_updated_at: string | null;
}

interface SkillFileRow {
  id: string;
  skill_id: string;
  path: string;
  kind: SkillFileKind;
  content: string;
  content_type: string;
  sha256: string;
  size_bytes: number;
  executable: number;
  created_at: string;
  updated_at: string;
}

function mapSkillFile(row: SkillFileRow): SkillFileSummary {
  return {
    id: row.id,
    skillId: row.skill_id,
    path: row.path,
    kind: row.kind,
    content: row.content,
    contentType: row.content_type,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    executable: row.executable === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJsonObject(value: string | null): SkillProviderRouteConfig | null {
  if (!value) return null;
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as SkillProviderRouteConfig : null;
}

function mergeSeedRouteConfig(existingValue: string | null, seedConfig: SkillSeed['route']['config']): SkillProviderRouteConfig | null {
  const existingConfig = parseJsonObject(existingValue);
  const defaultConfig = seedConfig as SkillProviderRouteConfig | null;
  if (!existingConfig) return defaultConfig;
  if (!defaultConfig) return existingConfig;
  return {
    ...defaultConfig,
    ...existingConfig,
    promptTemplates: Array.isArray(existingConfig.promptTemplates)
      ? existingConfig.promptTemplates
      : defaultConfig.promptTemplates,
  };
}

function parseToolRequirements(value: string | null): SkillToolRequirement[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed as SkillToolRequirement[] : [];
}

function mergeImportedRouteConfig(existingConfig: SkillProviderRouteConfig | null, snapshot: ImportedSkillKitSnapshot, now: string): SkillProviderRouteConfig {
  if (snapshot.sourceKind === 'manual') {
    return {
      ...(existingConfig ?? {}),
      importedSkillKit: undefined,
      manualSkillKit: {
        sourceLabel: snapshot.sourceLabel ?? 'Manual upload',
        lastImportedAt: now,
        fileCount: snapshot.files.length,
      },
      importWarnings: snapshot.warnings,
    };
  }
  return {
    ...(existingConfig ?? {}),
    manualSkillKit: undefined,
    importedSkillKit: {
      sourceUrl: snapshot.sourceUrl,
      sourceRef: snapshot.sourceRef,
      sourcePath: snapshot.sourcePath,
      lastImportedAt: now,
    },
    importWarnings: snapshot.warnings,
  };
}

function parseImportedSkillKitSource(config: SkillProviderRouteConfig | null): { sourceUrl: string; ref: string; folderPath?: string } | null {
  const source = config?.importedSkillKit;
  if (!source || typeof source !== 'object') return null;
  if (!source.sourceUrl || !source.sourceRef) return null;
  return {
    sourceUrl: source.sourceUrl,
    ref: source.sourceRef,
    ...(source.sourcePath ? { folderPath: source.sourcePath } : {}),
  };
}

function mapRoute(row: SkillRow): SkillProviderRoute | null {
  if (!row.route_id || !row.route_skill_id || !row.route_mode || !row.route_created_at || !row.route_updated_at) return null;
  return {
    id: row.route_id,
    skillId: row.route_skill_id,
    mode: row.route_mode,
    defaultProviderId: row.route_default_provider_id,
    searchProfile: row.route_search_profile,
    maxBudgetCents: row.route_max_budget_cents,
    config: parseJsonObject(row.route_config_json),
    createdAt: row.route_created_at,
    updatedAt: row.route_updated_at,
  };
}

function mapSummary(row: SkillRow): SkillSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: row.kind,
    status: row.status,
    visibility: row.visibility,
    category: row.category,
    icon: row.icon,
    route: mapRoute(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDetail(row: SkillRow): SkillDetail {
  return {
    ...mapSummary(row),
    inputSchema: parseJsonObject(row.input_schema_json),
    outputContract: parseJsonObject(row.output_contract_json),
    toolRequirements: parseToolRequirements(row.tool_requirements_json),
  };
}

const SELECT_SKILL_WITH_ROUTE = `
  SELECT
    s.*,
    r.id AS route_id,
    r.skill_id AS route_skill_id,
    r.mode AS route_mode,
    r.default_provider_id AS route_default_provider_id,
    r.search_profile AS route_search_profile,
    r.max_budget_cents AS route_max_budget_cents,
    r.config_json AS route_config_json,
    r.created_at AS route_created_at,
    r.updated_at AS route_updated_at
  FROM skills s
  LEFT JOIN skill_routes r ON r.skill_id = s.id
`;

export class SkillRepository {
  constructor(private readonly db: DbAdapter) {}

  async seedNative(seeds: SkillSeed[], now = new Date().toISOString()): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const seed of seeds) {
        const skillParams = {
          id: seed.id,
          slug: seed.slug,
          name: seed.name,
          description: seed.description,
          kind: seed.kind,
          status: seed.status,
          visibility: seed.visibility,
          category: seed.category,
          icon: seed.icon,
          inputSchemaJson: seed.inputSchema ? JSON.stringify(seed.inputSchema) : null,
          outputContractJson: seed.outputContract ? JSON.stringify(seed.outputContract) : null,
          toolRequirementsJson: JSON.stringify(seed.toolRequirements),
          createdAt: now,
          updatedAt: now,
        };

        const existingSkill = await tx.prepare(
          `SELECT id FROM skills
           WHERE slug = ? OR id = ?
           ORDER BY CASE WHEN slug = ? THEN 0 ELSE 1 END
           LIMIT 1`,
        ).get(seed.slug, seed.id, seed.slug) as { id: string } | undefined;

        if (existingSkill) {
          await tx.prepare(
            `UPDATE skills SET
              slug = @slug,
              name = @name,
              description = @description,
              kind = @kind,
              status = @status,
              visibility = @visibility,
              category = @category,
              icon = @icon,
              input_schema_json = @inputSchemaJson,
              output_contract_json = @outputContractJson,
              tool_requirements_json = @toolRequirementsJson,
              updated_at = @updatedAt
             WHERE id = @existingId`,
          ).run({ ...skillParams, existingId: existingSkill.id });
        } else {
          await tx.prepare(
            `INSERT INTO skills (
              id, slug, name, description, kind, status, visibility, category, icon,
              input_schema_json, output_contract_json, tool_requirements_json, created_at, updated_at
            ) VALUES (
              @id, @slug, @name, @description, @kind, @status, @visibility, @category, @icon,
              @inputSchemaJson, @outputContractJson, @toolRequirementsJson, @createdAt, @updatedAt
            )`,
          ).run(skillParams);
        }

        const skillId = existingSkill?.id ?? seed.id;
        const existingRoute = await tx.prepare(
          `SELECT config_json FROM skill_routes WHERE skill_id = ? LIMIT 1`,
        ).get(skillId) as { config_json: string | null } | undefined;
        const routeConfig = mergeSeedRouteConfig(existingRoute?.config_json ?? null, seed.route.config);

        await tx.prepare(
          `INSERT INTO skill_routes (
            id, skill_id, mode, default_provider_id, search_profile, max_budget_cents,
            config_json, created_at, updated_at
          ) VALUES (
            @id, @skillId, @mode, @defaultProviderId, @searchProfile, @maxBudgetCents,
            @configJson, @createdAt, @updatedAt
          ) ON CONFLICT(skill_id) DO UPDATE SET
            mode = @mode,
            default_provider_id = @defaultProviderId,
            search_profile = @searchProfile,
            max_budget_cents = @maxBudgetCents,
            config_json = @configJson,
            updated_at = @updatedAt`,
        ).run({
          id: seed.route.id,
          skillId,
          mode: seed.route.mode,
          defaultProviderId: seed.route.defaultProviderId,
          searchProfile: seed.route.searchProfile,
          maxBudgetCents: seed.route.maxBudgetCents,
          configJson: routeConfig ? JSON.stringify(routeConfig) : null,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  }

  async listVisible(): Promise<SkillSummary[]> {
    const rows = await this.db.prepare(
      `${SELECT_SKILL_WITH_ROUTE}
       WHERE s.status = 'PUBLISHED' AND s.visibility = 'USER_VISIBLE'
       ORDER BY s.category ASC, s.name ASC`,
    ).all() as SkillRow[];
    return rows.map(mapSummary);
  }

  async listVisibleDetails(): Promise<SkillDetail[]> {
    const rows = await this.db.prepare(
      `${SELECT_SKILL_WITH_ROUTE}
       WHERE s.status = 'PUBLISHED' AND s.visibility = 'USER_VISIBLE'
       ORDER BY s.category ASC, s.name ASC`,
    ).all() as SkillRow[];
    return rows.map(mapDetail);
  }

  async findVisibleBySlug(slug: string): Promise<SkillDetail | null> {
    const row = await this.db.prepare(
      `${SELECT_SKILL_WITH_ROUTE}
       WHERE s.slug = ? AND s.status = 'PUBLISHED' AND s.visibility = 'USER_VISIBLE'
       LIMIT 1`,
    ).get(slug) as SkillRow | undefined;
    return row ? mapDetail(row) : null;
  }

  async listAll(): Promise<SkillSummary[]> {
    const rows = await this.db.prepare(
      `${SELECT_SKILL_WITH_ROUTE}
       ORDER BY s.category ASC, s.name ASC`,
    ).all() as SkillRow[];
    return rows.map(mapSummary);
  }

  async findBySlug(slug: string): Promise<SkillDetail | null> {
    const row = await this.db.prepare(
      `${SELECT_SKILL_WITH_ROUTE}
       WHERE s.slug = ?
       LIMIT 1`,
    ).get(slug) as SkillRow | undefined;
    return row ? mapDetail(row) : null;
  }

  async listFilesBySkillSlug(slug: string): Promise<SkillFileSummary[] | null> {
    const skill = await this.findBySlug(slug);
    if (!skill) return null;
    const rows = await this.db.prepare(
      `SELECT * FROM skill_files
       WHERE skill_id = ?
       ORDER BY
         CASE kind
           WHEN 'skill' THEN 0
           WHEN 'reference' THEN 1
           WHEN 'template' THEN 2
           WHEN 'script' THEN 3
           WHEN 'asset' THEN 4
           ELSE 5
         END,
         path ASC`,
    ).all(skill.id) as SkillFileRow[];
    return rows.map(mapSkillFile);
  }

  async createManualImportedSkill(input: CreateSkillInput, now = new Date().toISOString()): Promise<{ skill: SkillDetail; files: SkillFileSummary[] } | null> {
    const existing = await this.findBySlug(input.slug);
    if (existing) return null;
    const skillId = `skl_imp_${input.slug.replaceAll('-', '_')}`;
    const routeId = `skr_${input.slug.replaceAll('-', '_')}`;
    const fileId = `skf_${skillId}_SKILL_md`;
    const instructions = input.instructions.trim();
    const sha256 = createHash('sha256').update(instructions).digest('hex');

    await this.db.transaction(async (tx) => {
      await tx.prepare(
        `INSERT INTO skills (
          id, slug, name, description, kind, status, visibility, category, icon,
          input_schema_json, output_contract_json, tool_requirements_json, created_at, updated_at
        ) VALUES (
          @id, @slug, @name, @description, 'IMPORTED', 'DRAFT', 'ADMIN_ONLY', @category, @icon,
          NULL, NULL, '[]', @createdAt, @updatedAt
        )`,
      ).run({
        id: skillId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        category: input.category ?? 'Imported',
        icon: input.icon ?? 'sparkles',
        createdAt: now,
        updatedAt: now,
      });

      await tx.prepare(
        `INSERT INTO skill_routes (
          id, skill_id, mode, default_provider_id, search_profile, max_budget_cents, config_json, created_at, updated_at
        ) VALUES (
          @id, @skillId, 'CHAT', NULL, NULL, NULL, @configJson, @createdAt, @updatedAt
        )`,
      ).run({
        id: routeId,
        skillId,
        configJson: JSON.stringify({ manuallyCreated: true }),
        createdAt: now,
        updatedAt: now,
      });

      await tx.prepare(
        `INSERT INTO skill_files (
          id, skill_id, path, kind, content, content_type, sha256, size_bytes, executable, created_at, updated_at
        ) VALUES (
          @id, @skillId, 'SKILL.md', 'skill', @content, 'text/markdown', @sha256, @sizeBytes, 0, @createdAt, @updatedAt
        )`,
      ).run({
        id: fileId,
        skillId,
        content: instructions,
        sha256,
        sizeBytes: Buffer.byteLength(instructions, 'utf8'),
        createdAt: now,
        updatedAt: now,
      });
    });

    const skill = await this.findBySlug(input.slug);
    const files = await this.listFilesBySkillSlug(input.slug);
    if (!skill || !files) return null;
    return { skill, files };
  }

  async updateSkill(slug: string, input: UpdateSkillInput, now = new Date().toISOString()): Promise<SkillDetail | null> {
    const current = await this.findBySlug(slug);
    if (!current) return null;
    const next = {
      ...current,
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      status: input.status ?? current.status,
      visibility: input.visibility ?? current.visibility,
      category: input.category === undefined ? current.category : input.category,
      icon: input.icon === undefined ? current.icon : input.icon,
      inputSchema: input.inputSchema === undefined ? current.inputSchema : input.inputSchema,
      outputContract: input.outputContract === undefined ? current.outputContract : input.outputContract,
      toolRequirements: input.toolRequirements === undefined ? current.toolRequirements : input.toolRequirements,
    };

    await this.db.prepare(
      `UPDATE skills
       SET name = @name,
           description = @description,
           status = @status,
           visibility = @visibility,
           category = @category,
           icon = @icon,
           input_schema_json = @inputSchemaJson,
           output_contract_json = @outputContractJson,
           tool_requirements_json = @toolRequirementsJson,
           updated_at = @updatedAt
       WHERE slug = @slug`,
    ).run({
      slug,
      name: next.name,
      description: next.description,
      status: next.status,
      visibility: next.visibility,
      category: next.category,
      icon: next.icon,
      inputSchemaJson: next.inputSchema ? JSON.stringify(next.inputSchema) : null,
      outputContractJson: next.outputContract ? JSON.stringify(next.outputContract) : null,
      toolRequirementsJson: JSON.stringify(next.toolRequirements),
      updatedAt: now,
    });
    return this.findBySlug(slug);
  }

  async updateSkillInstructions(slug: string, input: UpdateSkillInstructionsInput, now = new Date().toISOString()): Promise<SkillFileSummary[] | null> {
    const skill = await this.findBySlug(slug);
    if (!skill) return null;
    const content = input.content.trim();
    const lastTestedAt = skill.route?.config?.adminTestGate?.testedRouteUpdatedAt;
    const effectiveNow = lastTestedAt
      ? new Date(Math.max(new Date(now).getTime(), new Date(lastTestedAt).getTime() + 1)).toISOString()
      : now;
    const sha256 = createHash('sha256').update(content).digest('hex');
    const existingFile = await this.db.prepare(
      `SELECT * FROM skill_files
       WHERE skill_id = ? AND (kind = 'skill' OR lower(path) = 'skill.md')
       ORDER BY CASE WHEN lower(path) = 'skill.md' THEN 0 ELSE 1 END
       LIMIT 1`,
    ).get(skill.id) as SkillFileRow | undefined;

    await this.db.transaction(async (tx) => {
      if (existingFile) {
        await tx.prepare(
          `UPDATE skill_files
           SET path = 'SKILL.md',
               kind = 'skill',
               content = @content,
               content_type = 'text/markdown',
               sha256 = @sha256,
               size_bytes = @sizeBytes,
               executable = 0,
               updated_at = @updatedAt
           WHERE id = @id`,
        ).run({
          id: existingFile.id,
          content,
          sha256,
          sizeBytes: Buffer.byteLength(content, 'utf8'),
          updatedAt: effectiveNow,
        });
      } else {
        await tx.prepare(
          `INSERT INTO skill_files (
            id, skill_id, path, kind, content, content_type, sha256, size_bytes, executable, created_at, updated_at
          ) VALUES (
            @id, @skillId, 'SKILL.md', 'skill', @content, 'text/markdown', @sha256, @sizeBytes, 0, @createdAt, @updatedAt
          )`,
        ).run({
          id: `skf_${skill.id}_SKILL_md`,
          skillId: skill.id,
          content,
          sha256,
          sizeBytes: Buffer.byteLength(content, 'utf8'),
          createdAt: effectiveNow,
          updatedAt: effectiveNow,
        });
      }

      await tx.prepare('UPDATE skills SET updated_at = ? WHERE id = ?').run(effectiveNow, skill.id);
      if (skill.route) {
        await tx.prepare('UPDATE skill_routes SET updated_at = ? WHERE skill_id = ?').run(effectiveNow, skill.id);
      }
    });

    return this.listFilesBySkillSlug(slug);
  }


  async updateSkillFile(slug: string, input: UpdateSkillFileInput, now = new Date().toISOString()): Promise<SkillFileSummary[] | null> {
    const skill = await this.findBySlug(slug);
    if (!skill) return null;
    const file = await this.db.prepare(
      `SELECT * FROM skill_files
       WHERE skill_id = ? AND path = ?
       LIMIT 1`,
    ).get(skill.id, input.path) as SkillFileRow | undefined;
    if (!file) return null;
    const content = input.content;
    const lastTestedAt = skill.route?.config?.adminTestGate?.testedRouteUpdatedAt;
    const effectiveNow = lastTestedAt
      ? new Date(Math.max(new Date(now).getTime(), new Date(lastTestedAt).getTime() + 1)).toISOString()
      : now;
    const sha256 = createHash('sha256').update(content).digest('hex');

    await this.db.transaction(async (tx) => {
      await tx.prepare(
        `UPDATE skill_files
         SET content = @content,
             sha256 = @sha256,
             size_bytes = @sizeBytes,
             executable = 0,
             updated_at = @updatedAt
         WHERE id = @id`,
      ).run({
        id: file.id,
        content,
        sha256,
        sizeBytes: Buffer.byteLength(content, 'utf8'),
        updatedAt: effectiveNow,
      });
      await tx.prepare('UPDATE skills SET updated_at = ? WHERE id = ?').run(effectiveNow, skill.id);
      if (skill.route) {
        await tx.prepare('UPDATE skill_routes SET updated_at = ? WHERE skill_id = ?').run(effectiveNow, skill.id);
      }
    });

    return this.listFilesBySkillSlug(slug);
  }

  async upsertRoute(slug: string, input: UpdateSkillRouteInput, now = new Date().toISOString()): Promise<SkillProviderRoute | null> {
    const skill = await this.findBySlug(slug);
    if (!skill) return null;
    const routeId = skill.route?.id ?? `skr_${slug.replaceAll('-', '_')}`;
    const createdAt = skill.route?.createdAt ?? now;
    const config = input.config ? { ...input.config } as SkillProviderRouteConfig : null;
    if (config && skill.route?.config?.adminTestGate && !config.adminTestGate) {
      config.adminTestGate = skill.route.config.adminTestGate;
    }

    await this.db.prepare(
      `INSERT INTO skill_routes (
        id, skill_id, mode, default_provider_id, search_profile, max_budget_cents, config_json, created_at, updated_at
      ) VALUES (
        @id, @skillId, @mode, @defaultProviderId, @searchProfile, @maxBudgetCents, @configJson, @createdAt, @updatedAt
      ) ON CONFLICT(skill_id) DO UPDATE SET
        mode = excluded.mode,
        default_provider_id = excluded.default_provider_id,
        search_profile = excluded.search_profile,
        max_budget_cents = excluded.max_budget_cents,
        config_json = excluded.config_json,
        updated_at = excluded.updated_at`,
    ).run({
      id: routeId,
      skillId: skill.id,
      mode: input.mode,
      defaultProviderId: input.defaultProviderId ?? null,
      searchProfile: input.searchProfile ?? null,
      maxBudgetCents: input.maxBudgetCents ?? null,
      configJson: config ? JSON.stringify(config) : null,
      createdAt,
      updatedAt: now,
    });

    const updated = await this.findBySlug(slug);
    return updated?.route ?? null;
  }

  async recordAdminTestGate(slug: string, gate: Omit<SkillPublishGateLastTest, 'testedRouteUpdatedAt'>, now = new Date().toISOString()): Promise<SkillProviderRoute | null> {
    const skill = await this.findBySlug(slug);
    if (!skill?.route) return null;
    const config: SkillProviderRouteConfig = {
      ...(skill.route.config ?? {}),
      adminTestGate: {
        ...gate,
        testedRouteUpdatedAt: now,
      },
    };
    await this.db.prepare(
      `UPDATE skill_routes
       SET config_json = @configJson,
           updated_at = @updatedAt
       WHERE skill_id = @skillId`,
    ).run({
      skillId: skill.id,
      configJson: JSON.stringify(config),
      updatedAt: now,
    });
    const updated = await this.findBySlug(slug);
    return updated?.route ?? null;
  }

  async getImportSource(slug: string): Promise<{ sourceUrl: string; ref: string; folderPath?: string } | null> {
    const skill = await this.findBySlug(slug);
    if (!skill) return null;
    return parseImportedSkillKitSource(skill.route?.config ?? null);
  }

  async importSkillKit(snapshot: ImportedSkillKitSnapshot, now = new Date().toISOString()): Promise<ImportedSkillKitResult | null> {
    const existing = await this.findBySlug(snapshot.slug);
    if (existing?.kind === 'NATIVE') return null;
    const testedRouteUpdatedAt = existing?.route?.config?.adminTestGate?.testedRouteUpdatedAt;
    const effectiveNow = testedRouteUpdatedAt && new Date(now).getTime() <= new Date(testedRouteUpdatedAt).getTime()
      ? new Date(new Date(testedRouteUpdatedAt).getTime() + 1).toISOString()
      : now;
    const skillId = existing?.id ?? `skl_imp_${snapshot.slug.replaceAll('-', '_')}`;
    const routeId = existing?.route?.id ?? `skr_${snapshot.slug.replaceAll('-', '_')}`;
    const createdAt = existing?.createdAt ?? effectiveNow;
    const routeConfig = mergeImportedRouteConfig(existing?.route?.config ?? null, snapshot, effectiveNow);

    await this.db.transaction(async (tx) => {
      await tx.prepare(
        `INSERT INTO skills (
          id, slug, name, description, kind, status, visibility, category, icon,
          input_schema_json, output_contract_json, tool_requirements_json, created_at, updated_at
        ) VALUES (
          @id, @slug, @name, @description, 'IMPORTED', 'DRAFT', 'ADMIN_ONLY', 'Imported', 'sparkles',
          NULL, NULL, '[]', @createdAt, @updatedAt
        ) ON CONFLICT(slug) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          category = excluded.category,
          icon = excluded.icon,
          updated_at = excluded.updated_at`,
      ).run({
        id: skillId,
        slug: snapshot.slug,
        name: snapshot.name,
        description: snapshot.description,
        createdAt,
        updatedAt: effectiveNow,
      });

      await tx.prepare(
        `INSERT INTO skill_routes (
          id, skill_id, mode, default_provider_id, search_profile, max_budget_cents, config_json, created_at, updated_at
        ) VALUES (
          @id, @skillId, 'CHAT', NULL, NULL, NULL, @configJson, @createdAt, @updatedAt
        ) ON CONFLICT(skill_id) DO UPDATE SET
          config_json = excluded.config_json,
          updated_at = excluded.updated_at`,
      ).run({
        id: routeId,
        skillId,
        configJson: JSON.stringify(routeConfig),
        createdAt,
        updatedAt: effectiveNow,
      });

      await tx.prepare('DELETE FROM skill_files WHERE skill_id = ?').run(skillId);
      for (const file of snapshot.files) {
        await tx.prepare(
          `INSERT INTO skill_files (
            id, skill_id, path, kind, content, content_type, sha256, size_bytes, executable, created_at, updated_at
          ) VALUES (
            @id, @skillId, @path, @kind, @content, @contentType, @sha256, @sizeBytes, @executable, @createdAt, @updatedAt
          )`,
        ).run({
          id: `skf_${skillId}_${file.path.replace(/[^a-zA-Z0-9]+/g, '_')}`,
          skillId,
          path: file.path,
          kind: file.kind,
          content: file.content,
          contentType: file.contentType,
          sha256: file.sha256,
          sizeBytes: file.sizeBytes,
          executable: file.executable ? 1 : 0,
          createdAt: now,
          updatedAt: effectiveNow,
        });
      }
    });

    const skill = await this.findBySlug(snapshot.slug);
    if (!skill) return null;
    return {
      skill,
      files: snapshot.files.map((file) => ({ ...file, id: `skf_${skillId}_${file.path.replace(/[^a-zA-Z0-9]+/g, '_')}` })),
      warnings: snapshot.warnings,
    };
  }
}
