import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../db/database.js';

const tempDirs: string[] = [];

function tempSqliteUrl(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cogentrex-db-test-'));
  tempDirs.push(dir);
  return `sqlite://${join(dir, 'cogentrex.sqlite')}`;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('AppDatabase migrations', () => {
  it('makes legacy SQLite users.password_hash nullable for OAuth-only users', async () => {
    const url = tempSqliteUrl();
    const legacy = new AppDatabase(url);
    await legacy.adapter.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER',
        created_at TEXT NOT NULL
      );
      CREATE TABLE oauth_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(provider, provider_user_id)
      );
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'USER',
        created_at TEXT NOT NULL
      );
      INSERT INTO users (id, email, password_hash, role, created_at)
        VALUES ('usr_legacy', 'legacy@example.com', 'hash', 'USER', '2026-01-01T00:00:00.000Z');
    `);
    await legacy.close();

    const migrated = new AppDatabase(url);
    await migrated.init();

    const passwordColumn = await migrated.adapter.getOne<{ isNotNull: number }>(
      "SELECT \"notnull\" AS isNotNull FROM pragma_table_info('users') WHERE name = 'password_hash'",
    );
    expect(passwordColumn?.isNotNull).toBe(0);

    await migrated.adapter.execute(
      `INSERT INTO users (id, email, password_hash, role, created_at)
       VALUES (@id, @email, @passwordHash, @role, @createdAt)`,
      {
        id: 'usr_oauth',
        email: 'oauth@example.com',
        passwordHash: null,
        role: 'USER',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    );

    await migrated.close();
  });
});
