import type { DbAdapter } from '../db/adapter.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';

interface UsageRow {
  id: string;
  user_id: string;
  provider_id: string;
  date: string;
  request_count: number;
  token_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProviderUsageSummary {
  providerId: string;
  date: string;
  requestCount: number;
  tokenCount: number;
}

export class ProviderUsageRepository {
  constructor(private readonly db: DbAdapter) {}

  async record(userId: string, providerId: string, tokens: number): Promise<void>{
    const date = nowIso().slice(0, 10);
    const existing = await this.db.prepare(
      'SELECT * FROM provider_usage WHERE user_id = ? AND provider_id = ? AND date = ?',
    ).get(userId, providerId, date) as UsageRow | undefined;

    if (existing) {
      await this.db.prepare(
        `UPDATE provider_usage
         SET request_count = request_count + 1,
             token_count = token_count + @tokens,
             updated_at = @now
         WHERE user_id = @userId AND provider_id = @providerId AND date = @date`,
      ).run({ userId, providerId, date, tokens, now: nowIso() });
    } else {
      await this.db.prepare(
        `INSERT INTO provider_usage (id, user_id, provider_id, date, request_count, token_count, created_at, updated_at)
         VALUES (@id, @userId, @providerId, @date, 1, @tokens, @now, @now)`,
      ).run({
        id: createId('usu'),
        userId,
        providerId,
        date,
        tokens,
        now: nowIso(),
      });
    }
  }

  async getSummary(userId: string, providerId: string, days: number): Promise<ProviderUsageSummary[]>{
    const rows = await this.db.prepare(
      `SELECT provider_id as providerId, date, request_count as requestCount, token_count as tokenCount
       FROM provider_usage
       WHERE user_id = ? AND provider_id = ? AND date >= date('now', '-${Math.max(1, days)} days')
       ORDER BY date DESC`,
    ).all(userId, providerId) as { providerId: string; date: string; requestCount: number; tokenCount: number }[];
    return rows;
  }
}
