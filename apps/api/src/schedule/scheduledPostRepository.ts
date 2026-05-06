import type { DbAdapter } from '../db/adapter.js';

export interface ScheduledPostRecord {
  id: string;
  userId: string;
  platform: string;
  content: string;
  imageArtifactId: string | null;
  postAt: string;
  status: 'pending' | 'posted' | 'failed';
  errorMessage: string | null;
  postedAt: string | null;
  createdAt: string;
}

interface ScheduledPostRow {
  id: string;
  user_id: string;
  platform: string;
  content: string;
  image_artifact_id: string | null;
  post_at: string;
  status: string;
  error_message: string | null;
  posted_at: string | null;
  created_at: string;
}

function mapRow(row: ScheduledPostRow): ScheduledPostRecord {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    content: row.content,
    imageArtifactId: row.image_artifact_id ?? null,
    postAt: row.post_at,
    status: row.status as ScheduledPostRecord['status'],
    errorMessage: row.error_message ?? null,
    postedAt: row.posted_at ?? null,
    createdAt: row.created_at,
  };
}

export class ScheduledPostRepository {
  constructor(private readonly db: DbAdapter) {}

  async listForUser(userId: string): Promise<ScheduledPostRecord[]>{
    const rows = await this.db.prepare(
      'SELECT * FROM scheduled_posts WHERE user_id = ? ORDER BY post_at DESC',
    ).all(userId) as ScheduledPostRow[];
    return rows.map(mapRow);
  }

  async listPending(limit = 50): Promise<ScheduledPostRecord[]>{
    const now = new Date().toISOString();
    const rows = await this.db.prepare(
      'SELECT * FROM scheduled_posts WHERE status = ? AND post_at <= ? ORDER BY post_at ASC LIMIT ?',
    ).all('pending', now, limit) as ScheduledPostRow[];
    return rows.map(mapRow);
  }

  async create(post: ScheduledPostRecord): Promise<void>{
    await this.db.prepare(
      'INSERT INTO scheduled_posts (id, user_id, platform, content, image_artifact_id, post_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      post.id, post.userId, post.platform, post.content,
      post.imageArtifactId, post.postAt, post.status, post.createdAt,
    );
  }

  async markPosted(id: string, postedAt: string): Promise<void>{
    await this.db.prepare(
      'UPDATE scheduled_posts SET status = ?, posted_at = ? WHERE id = ?',
    ).run('posted', postedAt, id);
  }

  async markFailed(id: string, errorMessage: string): Promise<void>{
    await this.db.prepare(
      'UPDATE scheduled_posts SET status = ?, error_message = ? WHERE id = ?',
    ).run('failed', errorMessage, id);
  }

  async findById(userId: string, id: string): Promise<ScheduledPostRecord | null>{
    const row = await this.db.prepare('SELECT * FROM scheduled_posts WHERE user_id = ? AND id = ?').get(userId, id) as ScheduledPostRow | undefined;
    return row ? mapRow(row) : null;
  }

  async update(post: { id: string; userId: string; content: string; imageArtifactId: string | null; postAt: string }): Promise<void>{
    await this.db.prepare(
      'UPDATE scheduled_posts SET content = ?, image_artifact_id = ?, post_at = ? WHERE id = ? AND user_id = ?',
    ).run(post.content, post.imageArtifactId, post.postAt, post.id, post.userId);
  }

  async deleteForUser(userId: string, id: string): Promise<void>{
    await this.db.prepare('DELETE FROM scheduled_posts WHERE user_id = ? AND id = ?').run(userId, id);
  }
}
