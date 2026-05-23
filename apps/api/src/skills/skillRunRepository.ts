import type { AppMode, SkillRunStatus, SkillRunSummary } from '@cogentrex/shared';
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
    observability: row.observability_json ? JSON.parse(row.observability_json) as Record<string, unknown> : null,
  };
}

export class SkillRunRepository {
  constructor(private readonly db: DbAdapter) {}

  async create(input: CreateSkillRunInput): Promise<SkillRunSummary> {
    const id = createId('skr');
    const startedAt = nowIso();
    await this.db.prepare(
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
    const row = await this.db.prepare('SELECT * FROM skill_runs WHERE id = ?').get(id) as SkillRunRow;
    return mapRun(row);
  }

  async safeCreate(input: CreateSkillRunInput): Promise<SkillRunSummary | null> {
    try {
      return await this.create(input);
    } catch {
      return null;
    }
  }

  async complete(id: string, input: CompleteSkillRunInput): Promise<void> {
    const completedAt = nowIso();
    const existing = await this.db.prepare('SELECT * FROM skill_runs WHERE id = ?').get(id) as SkillRunRow | undefined;
    const durationMs = existing ? Math.max(0, new Date(completedAt).getTime() - new Date(existing.started_at).getTime()) : null;
    const existingObservability = existing?.observability_json ? JSON.parse(existing.observability_json) as Record<string, unknown> : {};
    const observability = input.observability ? { ...existingObservability, ...input.observability } : existingObservability;
    await this.db.prepare(
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
  }

  async safeComplete(id: string | null | undefined, input: CompleteSkillRunInput): Promise<void> {
    if (!id) return;
    try {
      await this.complete(id, input);
    } catch {
      // Skill run persistence must not break the primary user workflow.
    }
  }

  async listForUser(userId: string, limit = 50): Promise<SkillRunSummary[]> {
    const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const rows = await this.db.prepare(
      `SELECT * FROM skill_runs WHERE user_id = ? ORDER BY started_at DESC LIMIT ?`,
    ).all(userId, boundedLimit) as SkillRunRow[];
    return rows.map(mapRun);
  }
}
