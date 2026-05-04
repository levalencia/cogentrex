import type Database from 'better-sqlite3';
import type { PublicUser, UserRole } from '@cogentrex/shared';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export class AuthRepository {
  constructor(private readonly db: Database.Database) {}

  create(user: UserRecord): UserRecord {
    this.db.prepare(
      `INSERT INTO users (id, email, password_hash, role, created_at)
       VALUES (@id, @email, @passwordHash, @role, @createdAt)`,
    ).run(user);
    return user;
  }

  findByEmail(email: string): UserRecord | null {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  findById(id: string): UserRecord | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }
}
