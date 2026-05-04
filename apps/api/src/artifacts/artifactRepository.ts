import type { DbAdapter } from '../db/adapter.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';
import type { ArtifactItem } from '@cogentrex/shared';

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
  createdAt: string;
}

function mapArtifact(row: {
  id: string;
  user_id: string;
  conversation_id: string;
  message_id: string;
  type: string;
  filename: string;
  language: string | null;
  content: string;
  size_bytes: number;
  created_at: string;
}): ArtifactRecord {
  return {
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
}

export class ArtifactRepository {
  constructor(private readonly db: DbAdapter) {}

  async create(record: Omit<ArtifactRecord, 'id' | 'createdAt'>): Promise<ArtifactRecord> {
    const id = createId('art');
    const createdAt = nowIso();
    const artifact: ArtifactRecord = { ...record, id, createdAt };
    await this.db.prepare(
      `INSERT INTO artifacts (id, user_id, conversation_id, message_id, type, filename, language, content, size_bytes, created_at)
       VALUES (@id, @userId, @conversationId, @messageId, @type, @filename, @language, @content, @sizeBytes, @createdAt)`,
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
      createdAt,
    });
    return artifact;
  }

  async findById(userId: string, id: string): Promise<ArtifactRecord | undefined> {
    const row = await this.db.prepare(
      'SELECT * FROM artifacts WHERE id = ? AND user_id = ?',
    ).get(id, userId) as ReturnType<typeof mapArtifact>['id'] extends string ? any : never;
    return row ? mapArtifact(row) : undefined;
  }

  async listForConversation(userId: string, conversationId: string): Promise<ArtifactRecord[]> {
    const rows = await this.db.prepare(
      'SELECT * FROM artifacts WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC',
    ).all(userId, conversationId) as any[];
    return rows.map(mapArtifact);
  }

  async listForMessage(userId: string, messageId: string): Promise<ArtifactRecord[]> {
    const rows = await this.db.prepare(
      'SELECT * FROM artifacts WHERE user_id = ? AND message_id = ? ORDER BY created_at ASC',
    ).all(userId, messageId) as any[];
    return rows.map(mapArtifact);
  }

  async deleteForConversation(userId: string, conversationId: string): Promise<void> {
    await this.db.prepare(
      'DELETE FROM artifacts WHERE user_id = ? AND conversation_id = ?',
    ).run(userId, conversationId);
  }
}
