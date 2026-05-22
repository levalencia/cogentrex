import type { DbAdapter } from '../db/adapter.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';
import type { AppMode } from '@cogentrex/shared';

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
  conversationTitle?: string | undefined;
  conversationMode?: AppMode | undefined;
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
  created_at: string;
  conversation_title?: string | null;
  conversation_mode?: AppMode | null;
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
  if (row.conversation_title) artifact.conversationTitle = row.conversation_title;
  if (row.conversation_mode) artifact.conversationMode = row.conversation_mode;
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
    ).get(id, userId) as ArtifactRow | undefined;
    return row ? mapArtifact(row) : undefined;
  }

  async listForUser(userId: string): Promise<ArtifactRecord[]> {
    const rows = await this.db.prepare(
      `SELECT a.*, c.title AS conversation_title, c.mode AS conversation_mode
       FROM artifacts a
       JOIN conversations c ON c.id = a.conversation_id
       WHERE a.user_id = ? AND c.user_id = ?
       ORDER BY a.created_at DESC`,
    ).all(userId, userId) as ArtifactRow[];
    return rows.map(mapArtifact);
  }

  async createFromMessage(userId: string, messageId: string): Promise<ArtifactRecord | undefined> {
    const row = await this.db.prepare(
      `SELECT m.id AS message_id, m.conversation_id, m.content, c.title AS conversation_title, c.mode AS conversation_mode
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = ? AND m.id = ? AND m.role = 'assistant'`,
    ).get(userId, messageId) as { message_id: string; conversation_id: string; content: string; conversation_title: string; conversation_mode: AppMode } | undefined;

    if (!row) return undefined;

    const record = await this.create({
      userId,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      type: 'text/markdown',
      filename: filenameFromTitle(row.conversation_title),
      language: 'markdown',
      content: row.content,
      sizeBytes: Buffer.byteLength(row.content, 'utf-8'),
    });
    record.conversationTitle = row.conversation_title;
    record.conversationMode = row.conversation_mode;
    return record;
  }

  async listForConversation(userId: string, conversationId: string): Promise<ArtifactRecord[]> {
    const rows = await this.db.prepare(
      'SELECT * FROM artifacts WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC',
    ).all(userId, conversationId) as ArtifactRow[];
    return rows.map(mapArtifact);
  }

  async listForMessage(userId: string, messageId: string): Promise<ArtifactRecord[]> {
    const rows = await this.db.prepare(
      'SELECT * FROM artifacts WHERE user_id = ? AND message_id = ? ORDER BY created_at ASC',
    ).all(userId, messageId) as ArtifactRow[];
    return rows.map(mapArtifact);
  }

  async deleteForConversation(userId: string, conversationId: string): Promise<void> {
    await this.db.prepare(
      'DELETE FROM artifacts WHERE user_id = ? AND conversation_id = ?',
    ).run(userId, conversationId);
  }
}
