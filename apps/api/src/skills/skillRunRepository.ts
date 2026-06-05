import type { AppMode, SkillRunEvent, SkillRunStatus, SkillRunSummary } from '@cogentrex/shared';
import type { DbAdapter } from '../db/adapter.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';

interface SkillRunRow {
  id: string;
  user_id: string;
  skill_id: string;
  skill_slug: string;
  skill_name: string;
  mode: AppMode;
  status: SkillRunStatus;
  conversation_id: string | null;
  job_id: string | null;
  provider_id: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  observability_json: string | null;
  event_count?: number | string | null;
}

interface SkillRunEventRow {
  id: string;
  run_id: string;
  user_id: string;
  sequence: number;
  event_type: string;
  label: string;
  message: string | null;
  metadata_json: string | null;
  created_at: string;
}

interface CreateSkillRunInput {
  userId: string;
  skillId: string;
  skillSlug: string;
  skillName: string;
  mode: AppMode;
  status?: SkillRunStatus;
  conversationId?: string | null;
  jobId?: string | null;
  providerId?: string | null;
  observability?: Record<string, unknown> | null;
}

interface CompleteSkillRunInput {
  status: Extract<SkillRunStatus, 'completed' | 'failed'>;
  errorMessage?: string | null;
  observability?: Record<string, unknown> | null;
}

interface AppendSkillRunEventInput {
  eventType: string;
  label: string;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface SavedArtifactSummary {
  id: string;
  filename: string;
  type: string;
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function mapRun(row: SkillRunRow): SkillRunSummary {
  return {
    id: row.id,
    userId: row.user_id,
    skillId: row.skill_id,
    skillSlug: row.skill_slug,
    skillName: row.skill_name,
    mode: row.mode,
    status: row.status,
    conversationId: row.conversation_id,
    jobId: row.job_id,
    providerId: row.provider_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    observability: parseJsonObject(row.observability_json),
    eventCount: Number(row.event_count ?? 0),
  };
}

function mapEvent(row: SkillRunEventRow): SkillRunEvent {
  return {
    id: row.id,
    runId: row.run_id,
    userId: row.user_id,
    sequence: row.sequence,
    eventType: row.event_type,
    label: row.label,
    message: row.message,
    metadata: parseJsonObject(row.metadata_json),
    createdAt: row.created_at,
  };
}

const selectRunWithEventCount = `
  SELECT skill_runs.*,
         (SELECT COUNT(*) FROM skill_run_events WHERE skill_run_events.run_id = skill_runs.id) AS event_count
  FROM skill_runs
`;

function savedArtifactSummaries(observability: Record<string, unknown>, artifact: SavedArtifactSummary): SavedArtifactSummary[] {
  const existing = Array.isArray(observability.savedArtifacts)
    ? observability.savedArtifacts.flatMap((value): SavedArtifactSummary[] => {
        if (!value || typeof value !== 'object') return [];
        const item = value as Record<string, unknown>;
        return typeof item.id === 'string' && typeof item.filename === 'string' && typeof item.type === 'string'
          ? [{ id: item.id, filename: item.filename, type: item.type }]
          : [];
      })
    : [];
  const byId = new Map(existing.map((item) => [item.id, item]));
  byId.set(artifact.id, artifact);
  return Array.from(byId.values());
}

export class SkillRunRepository {
  constructor(private readonly db: DbAdapter) {}

  private async appendEventWithDb(db: DbAdapter, runId: string, userId: string, input: AppendSkillRunEventInput): Promise<SkillRunEvent> {
    const id = createId('ske');
    const createdAt = nowIso();
    const updated = await db.prepare(
      'UPDATE skill_runs SET event_sequence = COALESCE(event_sequence, 0) + 1 WHERE id = ? AND user_id = ?',
    ).run(runId, userId);
    if (updated.changes === 0) {
      throw new Error(`Cannot append event for missing skill run ${runId}`);
    }
    const sequenceRow = await db.prepare('SELECT event_sequence FROM skill_runs WHERE id = ? AND user_id = ?').get(runId, userId) as { event_sequence?: number | string } | undefined;
    const sequence = Number(sequenceRow?.event_sequence ?? 0);
    await db.prepare(
      `INSERT INTO skill_run_events (
        id, run_id, user_id, sequence, event_type, label, message, metadata_json, created_at
      ) VALUES (
        @id, @runId, @userId, @sequence, @eventType, @label, @message, @metadataJson, @createdAt
      )`,
    ).run({
      id,
      runId,
      userId,
      sequence,
      eventType: input.eventType,
      label: input.label,
      message: input.message ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt,
    });
    const row = await db.prepare('SELECT * FROM skill_run_events WHERE id = ?').get(id) as SkillRunEventRow;
    return mapEvent(row);
  }

  private async appendEventWithRetry(runId: string, userId: string, input: AppendSkillRunEventInput): Promise<SkillRunEvent> {
    return this.db.transaction((tx) => this.appendEventWithDb(tx, runId, userId, input));
  }

  async create(input: CreateSkillRunInput): Promise<SkillRunSummary> {
    const id = createId('skr');
    const startedAt = nowIso();
    return this.db.transaction(async (tx) => {
      await tx.prepare(
        `INSERT INTO skill_runs (
          id, user_id, skill_id, skill_slug, skill_name, mode, status,
          conversation_id, job_id, provider_id, started_at, observability_json
        ) VALUES (
          @id, @userId, @skillId, @skillSlug, @skillName, @mode, @status,
          @conversationId, @jobId, @providerId, @startedAt, @observabilityJson
        )`,
      ).run({
        id,
        userId: input.userId,
        skillId: input.skillId,
        skillSlug: input.skillSlug,
        skillName: input.skillName,
        mode: input.mode,
        status: input.status ?? 'running',
        conversationId: input.conversationId ?? null,
        jobId: input.jobId ?? null,
        providerId: input.providerId ?? null,
        startedAt,
        observabilityJson: input.observability ? JSON.stringify(input.observability) : null,
      });
      await this.appendEventWithDb(tx, id, input.userId, {
        eventType: 'run_started',
        label: `${input.skillName} started`,
        metadata: {
          mode: input.mode,
          skillSlug: input.skillSlug,
          conversationId: input.conversationId ?? null,
          jobId: input.jobId ?? null,
          providerId: input.providerId ?? null,
        },
      });
      const row = await tx.prepare(`${selectRunWithEventCount} WHERE skill_runs.id = ?`).get(id) as SkillRunRow;
      return mapRun(row);
    });
  }

  async safeCreate(input: CreateSkillRunInput): Promise<SkillRunSummary | null> {
    try {
      return await this.create(input);
    } catch {
      return null;
    }
  }

  async complete(id: string, input: CompleteSkillRunInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const completedAt = nowIso();
      const existing = await tx.prepare('SELECT * FROM skill_runs WHERE id = ?').get(id) as SkillRunRow | undefined;
      if (!existing) return;
      const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(existing.started_at).getTime());
      const existingObservability = parseJsonObject(existing.observability_json) ?? {};
      const observability = input.observability ? { ...existingObservability, ...input.observability } : existingObservability;
      await tx.prepare(
        `UPDATE skill_runs
         SET status = @status,
             completed_at = @completedAt,
             duration_ms = @durationMs,
             error_message = @errorMessage,
             observability_json = @observabilityJson
         WHERE id = @id`,
      ).run({
        id,
        status: input.status,
        completedAt,
        durationMs,
        errorMessage: input.errorMessage ?? null,
        observabilityJson: Object.keys(observability).length ? JSON.stringify(observability) : null,
      });
      await this.appendEventWithDb(tx, id, existing.user_id, {
        eventType: input.status === 'completed' ? 'run_completed' : 'run_failed',
        label: `${existing.skill_name} ${input.status}`,
        message: input.errorMessage ?? null,
        metadata: observability,
      });
    });
  }

  async safeComplete(id: string | null | undefined, input: CompleteSkillRunInput): Promise<void> {
    if (!id) return;
    try {
      await this.complete(id, input);
    } catch {
      // Skill run persistence must not break the primary user workflow.
    }
  }

  async appendEvent(runId: string, userId: string, input: AppendSkillRunEventInput): Promise<SkillRunEvent> {
    return this.appendEventWithRetry(runId, userId, input);
  }

  async safeAppendEvent(runId: string | null | undefined, userId: string | null | undefined, input: AppendSkillRunEventInput): Promise<void> {
    if (!runId || !userId) return;
    try {
      await this.appendEvent(runId, userId, input);
    } catch {
      // Event trace enrichment must not break the primary user workflow.
    }
  }

  async linkArtifactToMessage(userId: string, conversationId: string, messageId: string, artifact: SavedArtifactSummary): Promise<void> {
    await this.db.transaction(async (tx) => {
      const exactRow = await tx.prepare(
        `SELECT * FROM skill_runs
         WHERE user_id = ?
           AND conversation_id = ?
           AND REPLACE(observability_json, ' ', '') LIKE '%"messageId":"' || ? || '"%'
         ORDER BY COALESCE(completed_at, started_at) DESC, started_at DESC
         LIMIT 1`,
      ).get(userId, conversationId, messageId) as SkillRunRow | undefined;
      const row = exactRow ?? await tx.prepare(
        `SELECT * FROM skill_runs
         WHERE user_id = ? AND conversation_id = ?
         ORDER BY COALESCE(completed_at, started_at) DESC, started_at DESC
         LIMIT 1`,
      ).get(userId, conversationId) as SkillRunRow | undefined;
      if (!row) return;

      const observability = parseJsonObject(row.observability_json) ?? {};
      const existingIds = Array.isArray(observability.savedArtifactIds)
        ? observability.savedArtifactIds.filter((value): value is string => typeof value === 'string')
        : [];
      const savedArtifactIds = existingIds.includes(artifact.id) ? existingIds : [...existingIds, artifact.id];
      const savedArtifacts = savedArtifactSummaries(observability, artifact);
      await tx.prepare(
        `UPDATE skill_runs
         SET observability_json = @observabilityJson
         WHERE id = @id`,
      ).run({
        id: row.id,
        observabilityJson: JSON.stringify({
          ...observability,
          savedArtifactIds,
          savedArtifacts,
          savedArtifactCount: savedArtifactIds.length,
        }),
      });
      await this.appendEventWithDb(tx, row.id, userId, {
        eventType: 'artifact_saved',
        label: 'Artifact saved to library',
        metadata: { artifactId: artifact.id, filename: artifact.filename, type: artifact.type, savedArtifactCount: savedArtifactIds.length },
      });
    });
  }

  async safeLinkArtifactToMessage(userId: string, conversationId: string, messageId: string, artifact: SavedArtifactSummary): Promise<void> {
    try {
      await this.linkArtifactToMessage(userId, conversationId, messageId, artifact);
    } catch {
      // Artifact persistence must remain independent from run-ledger enrichment.
    }
  }

  async listForUser(userId: string, limit = 50): Promise<SkillRunSummary[]> {
    const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const rows = await this.db.prepare(
      `${selectRunWithEventCount} WHERE skill_runs.user_id = ? ORDER BY skill_runs.started_at DESC LIMIT ?`,
    ).all(userId, boundedLimit) as SkillRunRow[];
    return rows.map(mapRun);
  }

  async getForUser(userId: string, runId: string): Promise<SkillRunSummary | null> {
    const row = await this.db.prepare(
      `${selectRunWithEventCount} WHERE skill_runs.id = ? AND skill_runs.user_id = ?`,
    ).get(runId, userId) as SkillRunRow | undefined;
    return row ? mapRun(row) : null;
  }

  async listEventsForUserRun(userId: string, runId: string): Promise<SkillRunEvent[] | null> {
    const run = await this.db.prepare('SELECT id FROM skill_runs WHERE id = ? AND user_id = ?').get(runId, userId) as { id: string } | undefined;
    if (!run) return null;
    const rows = await this.db.prepare(
      'SELECT * FROM skill_run_events WHERE run_id = ? AND user_id = ? ORDER BY sequence ASC, created_at ASC',
    ).all(runId, userId) as SkillRunEventRow[];
    return rows.map(mapEvent);
  }
}
