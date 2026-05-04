import type Database from 'better-sqlite3';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';

export interface MediaArtifactRecord {
  id: string;
  userId: string;
  conversationId?: string | undefined;
  prompt: string;
  type: 'image' | 'video';
  providerId: string;
  blobUrl?: string | undefined;
  localPath?: string | undefined;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

interface ArtifactRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  prompt: string;
  type: string;
  provider_id: string;
  blob_url: string | null;
  local_path: string | null;
  status: string;
  created_at: string;
}

function mapArtifact(row: ArtifactRow): MediaArtifactRecord {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id ?? undefined,
    prompt: row.prompt,
    type: row.type as 'image' | 'video',
    providerId: row.provider_id,
    blobUrl: row.blob_url ?? undefined,
    localPath: row.local_path ?? undefined,
    status: row.status as 'pending' | 'completed' | 'failed',
    createdAt: row.created_at,
  };
}

export class MediaRepository {
  constructor(private readonly db: Database.Database) {}

  create(record: Omit<MediaArtifactRecord, 'id' | 'createdAt'>): MediaArtifactRecord {
    const id = createId('med');
    const createdAt = nowIso();
    const artifact: MediaArtifactRecord = { ...record, id, createdAt };
    this.db.prepare(
      `INSERT INTO media_artifacts (id, user_id, conversation_id, prompt, type, provider_id, blob_url, local_path, status, created_at)
       VALUES (@id, @userId, @conversationId, @prompt, @type, @providerId, @blobUrl, @localPath, @status, @createdAt)`,
    ).run({
      id,
      userId: record.userId,
      conversationId: record.conversationId ?? null,
      prompt: record.prompt,
      type: record.type,
      providerId: record.providerId,
      blobUrl: record.blobUrl ?? null,
      localPath: record.localPath ?? null,
      status: record.status,
      createdAt,
    });
    return artifact;
  }

  findById(userId: string, id: string): MediaArtifactRecord | undefined {
    const row = this.db.prepare('SELECT * FROM media_artifacts WHERE id = ? AND user_id = ?').get(id, userId) as ArtifactRow | undefined;
    return row ? mapArtifact(row) : undefined;
  }

  listForConversation(userId: string, conversationId: string): MediaArtifactRecord[] {
    const rows = this.db.prepare('SELECT * FROM media_artifacts WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC').all(userId, conversationId) as ArtifactRow[];
    return rows.map(mapArtifact);
  }

  updateStatus(id: string, status: 'pending' | 'completed' | 'failed', updates?: { blobUrl?: string; localPath?: string }): void {
    const fields: string[] = ['status = @status'];
    if (updates?.blobUrl) fields.push('blob_url = @blobUrl');
    if (updates?.localPath) fields.push('local_path = @localPath');
    this.db.prepare(`UPDATE media_artifacts SET ${fields.join(', ')} WHERE id = @id`).run({
      id,
      status,
      blobUrl: updates?.blobUrl ?? null,
      localPath: updates?.localPath ?? null,
    });
  }
}
