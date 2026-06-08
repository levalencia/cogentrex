import type { DbAdapter } from '../db/adapter.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';
import type { AppMode, ResearchSource, SkillRunStatus } from '@cogentrex/shared';

export interface ArtifactRecord {
  id: string;
  userId: string;
  conversationId: string;
  messageId: string;
  type: string;
  filename: string;
  language: string | null;
  content: string;
  sizeBytes: number;
  tags?: string[] | undefined;
  projectId?: string | null | undefined;
  projectName?: string | undefined;
  createdAt: string;
  conversationTitle?: string | undefined;
  conversationMode?: AppMode | undefined;
  baseConversationMode?: AppMode | undefined;
  effectiveMode?: AppMode | undefined;
  skillRunId?: string | undefined;
  skillRunName?: string | undefined;
  skillRunStatus?: SkillRunStatus | undefined;
}

interface ArtifactRow {
  id: string;
  user_id: string;
  conversation_id: string;
  message_id: string;
  type: string;
  filename: string;
  language: string | null;
  content: string;
  size_bytes: number;
  tags_json: string | null;
  project_id: string | null;
  project_name?: string | null;
  created_at: string;
  conversation_title?: string | null;
  conversation_mode?: AppMode | null;
  base_conversation_mode?: AppMode | null;
  effective_mode?: AppMode | null;
  skill_run_id?: string | null;
  skill_run_name?: string | null;
  skill_run_status?: SkillRunStatus | null;
}

const LATEST_SKILL_RUN_FILTER_SQL = 'sr.conversation_id = c.id AND sr.user_id = c.user_id';
const LATEST_SKILL_RUN_ORDER_SQL = 'COALESCE(sr.completed_at, sr.started_at) DESC, sr.started_at DESC';

function compactJsonSql(jsonSql: string): string {
  return `REPLACE(${jsonSql}, ' ', '')`;
}

function skillRunMessageFilterSql(messageIdSql: string): string {
  return `${LATEST_SKILL_RUN_FILTER_SQL} AND ${compactJsonSql('sr.observability_json')} LIKE '%"messageId":"' || ${messageIdSql} || '"%'`;
}

function skillRunArtifactFilterSql(artifactIdSql: string): string {
  const compactObservabilityJson = compactJsonSql('sr.observability_json');
  return `${LATEST_SKILL_RUN_FILTER_SQL}
    AND (
      (${compactObservabilityJson} LIKE '%"savedArtifactIds"%' AND ${compactObservabilityJson} LIKE '%"' || ${artifactIdSql} || '"%')
      OR (${compactObservabilityJson} LIKE '%"savedArtifacts"%' AND ${compactObservabilityJson} LIKE '%"id":"' || ${artifactIdSql} || '"%')
    )`;
}

function skillRunFieldSql(field: string, messageIdSql: string, artifactIdSql?: string): string {
  const artifactLookup = artifactIdSql ? `(
    SELECT sr.${field}
    FROM skill_runs sr
    WHERE ${skillRunArtifactFilterSql(artifactIdSql)}
    ORDER BY ${LATEST_SKILL_RUN_ORDER_SQL}
    LIMIT 1
  ), ` : '';
  return `COALESCE(${artifactLookup}(
    SELECT sr.${field}
    FROM skill_runs sr
    WHERE ${skillRunMessageFilterSql(messageIdSql)}
    ORDER BY ${LATEST_SKILL_RUN_ORDER_SQL}
    LIMIT 1
  ), (
    SELECT sr.${field}
    FROM skill_runs sr
    WHERE ${LATEST_SKILL_RUN_FILTER_SQL}
    ORDER BY ${LATEST_SKILL_RUN_ORDER_SQL}
    LIMIT 1
  ))`;
}

function artifactProvenanceSelectSql(messageIdSql: string, artifactIdSql?: string): string {
  const effectiveConversationModeSql = `COALESCE(${skillRunFieldSql('mode', messageIdSql, artifactIdSql)}, c.mode)`;
  return `
    c.title AS conversation_title,
    c.mode AS base_conversation_mode,
    ${effectiveConversationModeSql} AS conversation_mode,
    ${effectiveConversationModeSql} AS effective_mode,
    ${skillRunFieldSql('id', messageIdSql, artifactIdSql)} AS skill_run_id,
    ${skillRunFieldSql('skill_name', messageIdSql, artifactIdSql)} AS skill_run_name,
    ${skillRunFieldSql('status', messageIdSql, artifactIdSql)} AS skill_run_status
  `;
}

function parseTags(tagsJson: string | null | undefined): string[] | undefined {
  if (!tagsJson) return undefined;
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const tags = parsed.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
    return tags.length ? tags : undefined;
  } catch {
    return undefined;
  }
}

function normalizeTags(tags: string[] | undefined): string[] | undefined {
  if (!tags?.length) return undefined;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const cleaned = tag.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(cleaned);
  }
  return normalized.length ? normalized : undefined;
}

function mapArtifact(row: ArtifactRow): ArtifactRecord {
  const artifact: ArtifactRecord = {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    type: row.type,
    filename: row.filename,
    language: row.language,
    content: row.content,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
  const tags = parseTags(row.tags_json);
  if (tags) artifact.tags = tags;
  if (row.project_id) artifact.projectId = row.project_id;
  if (row.project_name) artifact.projectName = row.project_name;
  if (row.conversation_title) artifact.conversationTitle = row.conversation_title;
  if (row.conversation_mode) artifact.conversationMode = row.conversation_mode;
  if (row.base_conversation_mode) artifact.baseConversationMode = row.base_conversation_mode;
  if (row.effective_mode) artifact.effectiveMode = row.effective_mode;
  if (row.skill_run_id) artifact.skillRunId = row.skill_run_id;
  if (row.skill_run_name) artifact.skillRunName = row.skill_run_name;
  if (row.skill_run_status) artifact.skillRunStatus = row.skill_run_status;
  return artifact;
}

function filenameFromTitle(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim() || 'Saved output';
  return base.toLowerCase().endsWith('.md') ? base : `${base}.md`;
}

function isResearchSource(value: unknown): value is ResearchSource {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ResearchSource>;
  return typeof candidate.id === 'number' && typeof candidate.title === 'string' && typeof candidate.url === 'string';
}

function extractSources(metadataJson: string | null): ResearchSource[] {
  if (!metadataJson) return [];
  try {
    const metadata = JSON.parse(metadataJson) as { sources?: unknown };
    return Array.isArray(metadata.sources) ? metadata.sources.filter(isResearchSource) : [];
  } catch {
    return [];
  }
}

function appendSources(content: string, sources: ResearchSource[]): string {
  if (!sources.length || content.includes('## Sources')) return content;
  const sourceLines = sources.map((source) => {
    const snippet = source.snippet ? ` — ${source.snippet}` : '';
    return `[${source.id}] ${source.title} — ${source.url}${snippet}`;
  });
  return `${content.trim()}\n\n## Sources\n\n${sourceLines.join('\n')}`;
}

interface CreateArtifactFromMessageOptions {
  filename?: string | undefined;
  tags?: string[] | undefined;
  projectId?: string | null | undefined;
}

interface UpdateArtifactMetadataInput {
  filename?: string | undefined;
  tags?: string[] | undefined;
  projectId?: string | null | undefined;
}

export class ArtifactRepository {
  constructor(private readonly db: DbAdapter) {}

  async create(record: Omit<ArtifactRecord, 'id' | 'createdAt'>): Promise<ArtifactRecord> {
    const id = createId('art');
    const createdAt = nowIso();
    const tags = normalizeTags(record.tags);
    const artifact: ArtifactRecord = { ...record, id, createdAt };
    if (tags) artifact.tags = tags;
    await this.db.prepare(
      `INSERT INTO artifacts (id, user_id, conversation_id, message_id, type, filename, language, content, size_bytes, tags_json, project_id, created_at)
       VALUES (@id, @userId, @conversationId, @messageId, @type, @filename, @language, @content, @sizeBytes, @tagsJson, @projectId, @createdAt)`,
    ).run({
      id,
      userId: record.userId,
      conversationId: record.conversationId,
      messageId: record.messageId,
      type: record.type,
      filename: record.filename,
      language: record.language ?? null,
      content: record.content,
      sizeBytes: record.sizeBytes,
      tagsJson: tags ? JSON.stringify(tags) : null,
      projectId: record.projectId ?? null,
      createdAt,
    });
    return artifact;
  }

  async findById(userId: string, id: string): Promise<ArtifactRecord | undefined> {
    const row = await this.db.prepare(
      `SELECT a.*, p.name AS project_name, ${artifactProvenanceSelectSql('a.message_id', 'a.id')}
       FROM artifacts a
       JOIN conversations c ON c.id = a.conversation_id
       LEFT JOIN projects p ON p.id = a.project_id AND p.user_id = a.user_id
       WHERE a.id = ? AND a.user_id = ? AND c.user_id = ?`,
    ).get(id, userId, userId) as ArtifactRow | undefined;
    return row ? mapArtifact(row) : undefined;
  }

  async listForUser(userId: string): Promise<ArtifactRecord[]> {
    const rows = await this.db.prepare(
      `SELECT a.*, p.name AS project_name, ${artifactProvenanceSelectSql('a.message_id', 'a.id')}
       FROM artifacts a
       JOIN conversations c ON c.id = a.conversation_id
       LEFT JOIN projects p ON p.id = a.project_id AND p.user_id = a.user_id
       WHERE a.user_id = ? AND c.user_id = ?
       ORDER BY a.created_at DESC`,
    ).all(userId, userId) as ArtifactRow[];
    return rows.map(mapArtifact);
  }

  async createFromMessage(userId: string, messageId: string, options: CreateArtifactFromMessageOptions = {}): Promise<ArtifactRecord | undefined> {
    const row = await this.db.prepare(
      `SELECT m.id AS message_id, m.conversation_id, m.content, m.metadata_json, ${artifactProvenanceSelectSql('m.id')}
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = ? AND m.id = ? AND m.role = 'assistant'`,
    ).get(userId, messageId) as {
      message_id: string;
      conversation_id: string;
      content: string;
      metadata_json: string | null;
      conversation_title: string;
      conversation_mode: AppMode;
      base_conversation_mode?: AppMode | null;
      effective_mode?: AppMode | null;
      skill_run_id?: string | null;
      skill_run_name?: string | null;
      skill_run_status?: SkillRunStatus | null;
    } | undefined;

    if (!row) return undefined;

    let projectName: string | undefined;
    if (options.projectId) {
      const project = await this.db.prepare(
        'SELECT name FROM projects WHERE id = ? AND user_id = ?',
      ).get(options.projectId, userId) as { name: string } | undefined;
      if (!project) return undefined;
      projectName = project.name;
    }

    const content = appendSources(row.content, extractSources(row.metadata_json));
    const recordInput: Omit<ArtifactRecord, 'id' | 'createdAt'> = {
      userId,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      type: 'text/markdown',
      filename: filenameFromTitle(options.filename ?? row.conversation_title),
      language: 'markdown',
      content,
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
    };
    const tags = normalizeTags(options.tags);
    if (tags) recordInput.tags = tags;
    if (options.projectId) recordInput.projectId = options.projectId;
    if (projectName) recordInput.projectName = projectName;
    const record = await this.create(recordInput);
    record.conversationTitle = row.conversation_title;
    record.conversationMode = row.conversation_mode;
    if (row.base_conversation_mode) record.baseConversationMode = row.base_conversation_mode;
    if (row.effective_mode) record.effectiveMode = row.effective_mode;
    if (row.skill_run_id) record.skillRunId = row.skill_run_id;
    if (row.skill_run_name) record.skillRunName = row.skill_run_name;
    if (row.skill_run_status) record.skillRunStatus = row.skill_run_status;
    return record;
  }

  async listForConversation(userId: string, conversationId: string): Promise<ArtifactRecord[]> {
    const rows = await this.db.prepare(
      `SELECT a.*, p.name AS project_name, ${artifactProvenanceSelectSql('a.message_id', 'a.id')}
       FROM artifacts a
       JOIN conversations c ON c.id = a.conversation_id
       LEFT JOIN projects p ON p.id = a.project_id AND p.user_id = a.user_id
       WHERE a.user_id = ? AND a.conversation_id = ? AND c.user_id = ?
       ORDER BY a.created_at ASC`,
    ).all(userId, conversationId, userId) as ArtifactRow[];
    return rows.map(mapArtifact);
  }

  async listForMessage(userId: string, messageId: string): Promise<ArtifactRecord[]> {
    const rows = await this.db.prepare(
      `SELECT a.*, p.name AS project_name, ${artifactProvenanceSelectSql('a.message_id', 'a.id')}
       FROM artifacts a
       JOIN conversations c ON c.id = a.conversation_id
       LEFT JOIN projects p ON p.id = a.project_id AND p.user_id = a.user_id
       WHERE a.user_id = ? AND a.message_id = ? AND c.user_id = ?
       ORDER BY a.created_at ASC`,
    ).all(userId, messageId, userId) as ArtifactRow[];
    return rows.map(mapArtifact);
  }

  async updateMetadata(userId: string, id: string, input: UpdateArtifactMetadataInput): Promise<ArtifactRecord | undefined> {
    const existing = await this.findById(userId, id);
    if (!existing) return undefined;

    const hasTags = Object.prototype.hasOwnProperty.call(input, 'tags');
    const hasProjectId = Object.prototype.hasOwnProperty.call(input, 'projectId');
    const nextProjectId = hasProjectId ? (input.projectId ?? null) : (existing.projectId ?? null);
    let projectName: string | undefined;
    if (nextProjectId) {
      const project = await this.db.prepare(
        'SELECT name FROM projects WHERE id = ? AND user_id = ?',
      ).get(nextProjectId, userId) as { name: string } | undefined;
      if (!project) return undefined;
      projectName = project.name;
    }

    const filename = input.filename ? filenameFromTitle(input.filename) : existing.filename;
    const tags = hasTags ? (normalizeTags(input.tags) ?? []) : (existing.tags ?? []);
    await this.db.prepare(
      `UPDATE artifacts
       SET filename = @filename,
           tags_json = @tagsJson,
           project_id = @projectId
       WHERE id = @id AND user_id = @userId`,
    ).run({
      id,
      userId,
      filename,
      tagsJson: tags.length ? JSON.stringify(tags) : null,
      projectId: nextProjectId,
    });

    const updated = await this.findById(userId, id);
    if (updated && projectName) updated.projectName = projectName;
    return updated;
  }

  async deleteForConversation(userId: string, conversationId: string): Promise<void> {
    await this.db.prepare(
      'DELETE FROM artifacts WHERE user_id = ? AND conversation_id = ?',
    ).run(userId, conversationId);
  }
}
