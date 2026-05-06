import type { DbAdapter } from '../db/adapter.js';

export interface ResearchJobRecord {
  id: string;
  userId: string;
  conversationId: string | null;
  providerId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  question: string;
  plan: string[] | null;
  answer: string | null;
  sources: unknown[] | null;
  reasoning: unknown[] | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ResearchJobRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  provider_id: string | null;
  status: string;
  question: string;
  plan_json: string | null;
  answer: string | null;
  sources_json: string | null;
  reasoning_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function mapJob(row: ResearchJobRow): ResearchJobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    providerId: row.provider_id,
    status: row.status as ResearchJobRecord['status'],
    question: row.question,
    plan: parseJson<string[]>(row.plan_json),
    answer: row.answer,
    sources: parseJson<unknown[]>(row.sources_json),
    reasoning: parseJson<unknown[]>(row.reasoning_json),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ResearchJobRepository {
  constructor(private readonly db: DbAdapter) {}

  async create(record: Omit<ResearchJobRecord, 'plan' | 'answer' | 'sources' | 'reasoning' | 'errorMessage'> & { plan?: string[] }): Promise<ResearchJobRecord>{
    await this.db.prepare(
      `INSERT INTO research_jobs (id, user_id, conversation_id, provider_id, status, question, plan_json, created_at, updated_at)
       VALUES (@id, @userId, @conversationId, @providerId, @status, @question, @planJson, @createdAt, @updatedAt)`,
    ).run({
      ...record,
      planJson: record.plan ? JSON.stringify(record.plan) : null,
    });
    const created = await this.findById(record.userId, record.id);
    if (!created) throw new Error('Research job was not created');
    return created;
  }

  async findById(userId: string, id: string): Promise<ResearchJobRecord | null>{
    const row = await this.db.prepare('SELECT * FROM research_jobs WHERE user_id = ? AND id = ?').get(userId, id) as ResearchJobRow | undefined;
    return row ? mapJob(row) : null;
  }

  async updateStatus(id: string, status: ResearchJobRecord['status'], now: string, extras?: { answer?: string; sources?: unknown[]; reasoning?: unknown[]; errorMessage?: string }): Promise<void> {
    const sets = ['status = @status', 'updated_at = @now'];
    const params: Record<string, unknown> = { id, status, now };
    if (extras?.answer !== undefined) {
      sets.push('answer = @answer');
      params.answer = extras.answer;
    }
    if (extras?.sources !== undefined) {
      sets.push('sources_json = @sources');
      params.sources = JSON.stringify(extras.sources);
    }
    if (extras?.reasoning !== undefined) {
      sets.push('reasoning_json = @reasoning');
      params.reasoning = JSON.stringify(extras.reasoning);
    }
    if (extras?.errorMessage !== undefined) {
      sets.push('error_message = @error');
      params.error = extras.errorMessage;
    }
    await this.db.prepare(`UPDATE research_jobs SET ${sets.join(', ')} WHERE id = @id`).run(params);
  }
}
