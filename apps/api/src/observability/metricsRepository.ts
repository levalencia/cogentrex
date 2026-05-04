import type { DbAdapter } from '../db/adapter.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';

export interface RequestMetric {
  id: string;
  userId: string;
  conversationId?: string | undefined;
  messageId?: string | undefined;
  providerId?: string | undefined;
  model?: string | undefined;
  mode?: string | undefined;
  step: string;
  durationMs?: number | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  totalTokens?: number | undefined;
  ttftMs?: number | undefined;
  tps?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt: string;
}

interface MetricRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  message_id: string | null;
  provider_id: string | null;
  model: string | null;
  mode: string | null;
  step: string;
  duration_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  ttft_ms: number | null;
  tps: number | null;
  metadata_json: string | null;
  created_at: string;
}

function mapMetric(row: MetricRow): RequestMetric {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id ?? undefined,
    messageId: row.message_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    model: row.model ?? undefined,
    mode: row.mode ?? undefined,
    step: row.step,
    durationMs: row.duration_ms ?? undefined,
    promptTokens: row.prompt_tokens ?? undefined,
    completionTokens: row.completion_tokens ?? undefined,
    totalTokens: row.total_tokens ?? undefined,
    ttftMs: row.ttft_ms ?? undefined,
    tps: row.tps ?? undefined,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined,
    createdAt: row.created_at,
  };
}

export class MetricsRepository {
  constructor(private readonly db: DbAdapter) {}

  async record(metric: Omit<RequestMetric, 'id' | 'createdAt'>): Promise<RequestMetric>{
    const id = createId('mtr');
    const createdAt = nowIso();
    const record: RequestMetric = {
      id,
      userId: metric.userId,
      conversationId: metric.conversationId,
      messageId: metric.messageId,
      providerId: metric.providerId,
      model: metric.model,
      mode: metric.mode,
      step: metric.step,
      durationMs: metric.durationMs,
      promptTokens: metric.promptTokens,
      completionTokens: metric.completionTokens,
      totalTokens: metric.totalTokens,
      ttftMs: metric.ttftMs,
      tps: metric.tps,
      metadata: metric.metadata,
      createdAt,
    };
    this.db.prepare(
      `INSERT INTO request_metrics (
        id, user_id, conversation_id, message_id, provider_id, model, mode, step,
        duration_ms, prompt_tokens, completion_tokens, total_tokens, ttft_ms, tps,
        metadata_json, created_at
      ) VALUES (
        @id, @userId, @conversationId, @messageId, @providerId, @model, @mode, @step,
        @durationMs, @promptTokens, @completionTokens, @totalTokens, @ttftMs, @tps,
        @metadataJson, @createdAt
      )`,
    ).run({
      id,
      userId: metric.userId,
      conversationId: metric.conversationId ?? null,
      messageId: metric.messageId ?? null,
      providerId: metric.providerId ?? null,
      model: metric.model ?? null,
      mode: metric.mode ?? null,
      step: metric.step,
      durationMs: metric.durationMs ?? null,
      promptTokens: metric.promptTokens ?? null,
      completionTokens: metric.completionTokens ?? null,
      totalTokens: metric.totalTokens ?? null,
      ttftMs: metric.ttftMs ?? null,
      tps: metric.tps ?? null,
      metadataJson: metric.metadata ? JSON.stringify(metric.metadata) : null,
      createdAt,
    });
    return record;
  }

  async listForConversation(userId: string, conversationId: string): Promise<RequestMetric[]>{
    const rows = await this.db.prepare(
      `SELECT * FROM request_metrics WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC`,
    ).all(userId, conversationId) as MetricRow[];
    return rows.map(mapMetric);
  }

  async listForUser(userId: string, limit = 100): Promise<RequestMetric[]>{
    const rows = await this.db.prepare(
      `SELECT * FROM request_metrics WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    ).all(userId, limit) as MetricRow[];
    return rows.map(mapMetric);
  }
}
