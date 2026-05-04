import type Database from 'better-sqlite3';
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
  constructor(private readonly db: Database.Database) {}

  create(record: Omit<ArtifactRecord, 'id' | 'createdAt'>
): ArtifactRecord {
    const id = createId('art');
    const createdAt = nowIso();
    const artifact: ArtifactRecord = { ...record, id, createdAt };
    this.db.prepare(
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

  findById(userId: string, id: string): ArtifactRecord | undefined {
    const row = this.db.prepare(
      'SELECT * FROM artifacts WHERE id = ? AND user_id = ?',
    ).get(id, userId) as ReturnType<typeof mapArtifact>['id'] extends string ? any : never;
    return row ? mapArtifact(row) : undefined;
  }

  listForConversation(userId: string, conversationId: string): ArtifactRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM artifacts WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC',
    ).all(userId, conversationId) as any[];
    return rows.map(mapArtifact);
  }

  listForMessage(userId: string, messageId: string): ArtifactRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM artifacts WHERE user_id = ? AND message_id = ? ORDER BY created_at ASC',
    ).all(userId, messageId) as any[];
    return rows.map(mapArtifact);
  }

  deleteForConversation(userId: string, conversationId: string): void {
    this.db.prepare(
      'DELETE FROM artifacts WHERE user_id = ? AND conversation_id = ?',
    ).run(userId, conversationId);
  }
}
