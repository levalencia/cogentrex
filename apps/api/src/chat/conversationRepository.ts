import type { DbAdapter } from '../db/adapter.js';
import type { AppMode, ChatMessage, ConversationSummary } from '@cogentrex/shared';

interface ConversationRow {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  mode: AppMode;
  is_pinned: 0 | 1;
  is_public: 0 | 1;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

function mapConversation(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    isPinned: row.is_pinned === 1,
    isPublic: row.is_public === 1,
    shareToken: row.share_token ?? null,
    projectId: row.project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: ChatMessage['role'];
  content: string;
  metadata_json: string | null;
  created_at: string;
}

function mapMessage(row: MessageRow): ChatMessage {
  const message: ChatMessage = {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
  if (row.metadata_json) message.metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
  return message;
}

export class ConversationRepository {
  constructor(private readonly db: DbAdapter) {}

  async list(userId: string, projectId?: string | null): Promise<ConversationSummary[]> {
    if (projectId === null) {
      const rows = await this.db.prepare(
        "SELECT * FROM conversations WHERE user_id = ? AND project_id IS NULL ORDER BY is_pinned DESC, updated_at DESC",
      ).all(userId) as ConversationRow[];
      return rows.map(mapConversation);
    }
    if (projectId) {
      const rows = await this.db.prepare(
        "SELECT * FROM conversations WHERE user_id = ? AND project_id = ? ORDER BY is_pinned DESC, updated_at DESC",
      ).all(userId, projectId) as ConversationRow[];
      return rows.map(mapConversation);
    }
    const rows = await this.db.prepare(
      "SELECT * FROM conversations WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC",
    ).all(userId) as ConversationRow[];
    return rows.map(mapConversation);
  }

  async create(input: { id: string; userId: string; title: string; mode: AppMode; projectId?: string | null; now: string }): Promise<ConversationSummary> {
    await this.db.prepare(
      `INSERT INTO conversations (id, user_id, project_id, title, mode, created_at, updated_at)
       VALUES (@id, @userId, @projectId, @title, @mode, @now, @now)`,
    ).run({ ...input, projectId: input.projectId ?? null });
    return { id: input.id, title: input.title, mode: input.mode, isPinned: false, isPublic: false, shareToken: null, projectId: input.projectId ?? null, createdAt: input.now, updatedAt: input.now };
  }

  async findForUser(userId: string, id: string): Promise<ConversationSummary | null> {
    const row = await this.db.prepare('SELECT * FROM conversations WHERE user_id = ? AND id = ?').get(userId, id) as ConversationRow | undefined;
    return row ? mapConversation(row) : null;
  }

  async touch(id: string, now: string): Promise<void> {
    await this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, id);
  }

  async setMode(userId: string, id: string, mode: AppMode, now: string): Promise<void> {
    await this.db.prepare(
      'UPDATE conversations SET mode = ?, updated_at = ? WHERE user_id = ? AND id = ?',
    ).run(mode, now, userId, id);
  }

  async addMessage(input: {
    id: string;
    conversationId: string;
    role: ChatMessage['role'];
    content: string;
    metadata?: Record<string, unknown>;
    now: string;
  }): Promise<ChatMessage> {
    await this.db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, metadata_json, created_at)
       VALUES (@id, @conversationId, @role, @content, @metadataJson, @now)`,
    ).run({ ...input, metadataJson: input.metadata ? JSON.stringify(input.metadata) : null });
    await this.touch(input.conversationId, input.now);
    const message: ChatMessage = {
      id: input.id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      createdAt: input.now,
    };
    if (input.metadata) message.metadata = input.metadata;
    return message;
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    ).all(conversationId) as MessageRow[];
    return rows.map(mapMessage);
  }

  async updateTitle(userId: string, id: string, title: string, now: string): Promise<void> {
    await this.db.prepare(
      'UPDATE conversations SET title = ?, updated_at = ? WHERE user_id = ? AND id = ?',
    ).run(title, now, userId, id);
  }

  async setPinned(userId: string, id: string, pinned: boolean): Promise<void> {
    await this.db.prepare(
      'UPDATE conversations SET is_pinned = ? WHERE user_id = ? AND id = ?',
    ).run(pinned ? 1 : 0, userId, id);
  }

  async setProject(userId: string, id: string, projectId: string | null): Promise<void> {
    await this.db.prepare(
      'UPDATE conversations SET project_id = ?, updated_at = ? WHERE user_id = ? AND id = ?',
    ).run(projectId, new Date().toISOString(), userId, id);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.db.prepare('DELETE FROM conversations WHERE user_id = ? AND id = ?').run(userId, id);
  }

  async deleteAll(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
  }

  // ── Share token ────────────────────────────────────

  async findByShareToken(token: string): Promise<ConversationSummary | null> {
    const row = await this.db.prepare('SELECT * FROM conversations WHERE share_token = ? AND is_public = 1').get(token) as ConversationRow | undefined;
    return row ? mapConversation(row) : null;
  }

  async setShareToken(userId: string, id: string, token: string | null, now: string): Promise<void> {
    await this.db.prepare(
      'UPDATE conversations SET share_token = ?, is_public = ?, updated_at = ? WHERE user_id = ? AND id = ?',
    ).run(token, token ? 1 : 0, now, userId, id);
  }
}
