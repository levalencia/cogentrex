import type { DbAdapter } from '../db/adapter.js';
import type { ResearchSource } from '@cogentrex/shared';

interface ResearchSourceRow {
  id: string;
  conversation_id: string;
  source_id: number;
  title: string;
  url: string;
  snippet: string | null;
  excerpt: string | null;
  channel: string | null;
  created_at: string;
}

function mapRow(row: ResearchSourceRow): ResearchSource & { excerpt?: string | undefined } {
  return {
    id: row.source_id,
    title: row.title,
    url: row.url,
    snippet: row.snippet ?? undefined,
    channel: row.channel ?? undefined,
    excerpt: row.excerpt ?? undefined,
  };
}

export class ResearchSourceRepository {
  constructor(private readonly db: DbAdapter) {}

  async listByConversation(conversationId: string): Promise<Array<ResearchSource & { excerpt?: string | undefined }>> {
    const rows = await this.db.prepare(
      'SELECT * FROM research_sources WHERE conversation_id = ? ORDER BY source_id ASC',
    ).all(conversationId) as ResearchSourceRow[];
    return rows.map(mapRow);
  }

  async replaceAll(conversationId: string, sources: Array<ResearchSource & { excerpt?: string | undefined }>, now: string): Promise<void> {
    const deleteStmt = this.db.prepare('DELETE FROM research_sources WHERE conversation_id = ?');
    const insertStmt = this.db.prepare(
      `INSERT INTO research_sources (id, conversation_id, source_id, title, url, snippet, excerpt, channel, created_at)
       VALUES (@id, @conversationId, @sourceId, @title, @url, @snippet, @excerpt, @channel, @now)`,
    );
    await deleteStmt.run(conversationId);
    for (const source of sources) {
      await insertStmt.run({
        id: `rs_${conversationId}_${source.id}`,
        conversationId,
        sourceId: source.id,
        title: source.title,
        url: source.url,
        snippet: source.snippet ?? null,
        excerpt: (source as { excerpt?: string }).excerpt ?? null,
        channel: source.channel ?? null,
        now,
      });
    }
  }

  async deleteByConversation(conversationId: string): Promise<void> {
    await this.db.prepare('DELETE FROM research_sources WHERE conversation_id = ?').run(conversationId);
  }
}
