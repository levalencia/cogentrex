import type { DbAdapter } from '../db/adapter.js';

export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectRepository {
  constructor(private readonly db: DbAdapter) {}

  async listForUser(userId: string): Promise<ProjectRecord[]>{
    const rows = await this.db.prepare(
      'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
    ).all(userId) as ProjectRow[];
    return rows.map(mapRow);
  }

  async findById(userId: string, id: string): Promise<ProjectRecord | null>{
    const row = await this.db.prepare(
      'SELECT * FROM projects WHERE user_id = ? AND id = ?',
    ).get(userId, id) as ProjectRow | undefined;
    return row ? mapRow(row) : null;
  }

  async create(project: ProjectRecord): Promise<ProjectRecord>{
    await this.db.prepare(
      'INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(project.id, project.userId, project.name, project.createdAt, project.updatedAt);
    return project;
  }

  async update(userId: string, id: string, name: string, updatedAt: string): Promise<void>{
    await this.db.prepare(
      'UPDATE projects SET name = ?, updated_at = ? WHERE user_id = ? AND id = ?',
    ).run(name, updatedAt, userId, id);
  }

  async delete(userId: string, id: string): Promise<void>{
    await this.db.prepare(
      'DELETE FROM projects WHERE user_id = ? AND id = ?',
    ).run(userId, id);
  }
}
