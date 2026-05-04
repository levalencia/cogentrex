import type Database from 'better-sqlite3';

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
  constructor(private readonly db: Database.Database) {}

  listForUser(userId: string): ProjectRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
    ).all(userId) as ProjectRow[];
    return rows.map(mapRow);
  }

  findById(userId: string, id: string): ProjectRecord | null {
    const row = this.db.prepare(
      'SELECT * FROM projects WHERE user_id = ? AND id = ?',
    ).get(userId, id) as ProjectRow | undefined;
    return row ? mapRow(row) : null;
  }

  create(project: ProjectRecord): ProjectRecord {
    this.db.prepare(
      'INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(project.id, project.userId, project.name, project.createdAt, project.updatedAt);
    return project;
  }

  update(userId: string, id: string, name: string, updatedAt: string): void {
    this.db.prepare(
      'UPDATE projects SET name = ?, updated_at = ? WHERE user_id = ? AND id = ?',
    ).run(name, updatedAt, userId, id);
  }

  delete(userId: string, id: string): void {
    this.db.prepare(
      'DELETE FROM projects WHERE user_id = ? AND id = ?',
    ).run(userId, id);
  }
}
