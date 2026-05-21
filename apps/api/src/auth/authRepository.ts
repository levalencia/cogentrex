import type { DbAdapter } from '../db/adapter.js';
import type { PublicUser, UserRole } from '@cogentrex/shared';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  createdAt: string;
}

export interface OAuthAccountRecord {
  id: string;
  userId: string;
  provider: 'google';
  providerUserId: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  role: UserRole;
  created_at: string;
}

interface OAuthAccountRow {
  id: string;
  user_id: string;
  provider: 'google';
  provider_user_id: string;
  email: string;
  created_at: string;
  updated_at: string;
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

function mapOAuthAccount(row: OAuthAccountRow): OAuthAccountRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  constructor(private readonly db: DbAdapter) {}

  async create(user: UserRecord): Promise<UserRecord> {
    await this.db.prepare(
      `INSERT INTO users (id, email, password_hash, role, created_at)
       VALUES (@id, @email, @passwordHash, @role, @createdAt)`,
    ).run(user);
    return user;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  async findOAuthAccount(provider: 'google', providerUserId: string): Promise<OAuthAccountRecord | null> {
    const row = await this.db.prepare(
      'SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?',
    ).get(provider, providerUserId) as OAuthAccountRow | undefined;
    return row ? mapOAuthAccount(row) : null;
  }

  async createOAuthAccount(account: OAuthAccountRecord): Promise<OAuthAccountRecord> {
    await this.db.prepare(
      `INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, created_at, updated_at)
       VALUES (@id, @userId, @provider, @providerUserId, @email, @createdAt, @updatedAt)`,
    ).run(account);
    return account;
  }
}
