import { createHash } from 'node:crypto';
import type {
  AppMode,
  CreateSkillInput,
  SkillDetail,
  SkillFileKind,
  SkillFileSummary,
  SkillKind,
  SkillProviderRoute,
  SkillStatus,
  SkillSummary,
  SkillToolRequirement,
  SkillVisibility,
  UpdateSkillInput,
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
  sourceUrl: string;
  sourceRef: string;
  sourcePath: string;
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

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}

function parseToolRequirements(value: string | null): SkillToolRequirement[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed as SkillToolRequirement[] : [];
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
        await tx.prepare(
          `INSERT INTO skills (
            id, slug, name, description, kind, status, visibility, category, icon,
            input_schema_json, output_contract_json, tool_requirements_json, created_at, updated_at
          ) VALUES (
            @id, @slug, @name, @description, @kind, @status, @visibility, @category, @icon,
            @inputSchemaJson, @outputContractJson, @toolRequirementsJson, @createdAt, @updatedAt
          ) ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug,
            name = CASE WHEN skills.kind = 'NATIVE' THEN excluded.name ELSE skills.name END,
            description = CASE WHEN skills.kind = 'NATIVE' THEN excluded.description ELSE skills.description END,
            input_schema_json = CASE WHEN skills.kind = 'NATIVE' THEN excluded.input_schema_json ELSE skills.input_schema_json END,
            output_contract_json = CASE WHEN skills.kind = 'NATIVE' THEN excluded.output_contract_json ELSE skills.output_contract_json END,
            tool_requirements_json = CASE WHEN skills.kind = 'NATIVE' THEN excluded.tool_requirements_json ELSE skills.tool_requirements_json END,
            updated_at = skills.updated_at`,
        ).run({
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
        });

        await tx.prepare(
          `INSERT INTO skill_routes (
            id, skill_id, mode, default_provider_id, search_profile, max_budget_cents,
            config_json, created_at, updated_at
          ) VALUES (
            @id, @skillId, @mode, @defaultProviderId, @searchProfile, @maxBudgetCents,
            @configJson, @createdAt, @updatedAt
          ) ON CONFLICT(skill_id) DO NOTHING`,
        ).run({
          id: seed.route.id,
          skillId: seed.id,
          mode: seed.route.mode,
          defaultProviderId: seed.route.defaultProviderId,
          searchProfile: seed.route.searchProfile,
          maxBudgetCents: seed.route.maxBudgetCents,
          configJson: seed.route.config ? JSON.stringify(seed.route.config) : null,
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

  async upsertRoute(slug: string, input: UpdateSkillRouteInput, now = new Date().toISOString()): Promise<SkillProviderRoute | null> {
    const skill = await this.findBySlug(slug);
    if (!skill) return null;
    const routeId = skill.route?.id ?? `skr_${slug.replaceAll('-', '_')}`;
    const createdAt = skill.route?.createdAt ?? now;

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
      configJson: input.config ? JSON.stringify(input.config) : null,
      createdAt,
      updatedAt: now,
    });

    return (await this.findBySlug(slug))?.route ?? null;
  }

  async importSkillKit(snapshot: ImportedSkillKitSnapshot, now = new Date().toISOString()): Promise<ImportedSkillKitResult | null> {
    const existing = await this.findBySlug(snapshot.slug);
    if (existing?.kind === 'NATIVE') return null;
    const skillId = existing?.id ?? `skl_imp_${snapshot.slug.replaceAll('-', '_')}`;
    const routeId = existing?.route?.id ?? `skr_${snapshot.slug.replaceAll('-', '_')}`;
    const createdAt = existing?.createdAt ?? now;

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
        updatedAt: now,
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
        configJson: JSON.stringify({
          importedSkillKit: {
            sourceUrl: snapshot.sourceUrl,
            sourceRef: snapshot.sourceRef,
            sourcePath: snapshot.sourcePath,
          },
        }),
        createdAt,
        updatedAt: now,
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
          updatedAt: now,
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
