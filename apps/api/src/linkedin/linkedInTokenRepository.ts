import type Database from 'better-sqlite3';

export interface LinkedInTokenRecord {
  id: number;
  userId: string;
  encryptedAccessToken: string;
  personUrn: string | null;
  expiresAt: string | null;
  connectedAt: string;
  updatedAt: string;
}

interface LinkedInTokenRow {
  id: number;
  user_id: string;
  encrypted_access_token: string;
  person_urn: string | null;
  expires_at: string | null;
  connected_at: string;
  updated_at: string;
}

function mapRow(row: LinkedInTokenRow): LinkedInTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    encryptedAccessToken: row.encrypted_access_token,
    personUrn: row.person_urn ?? null,
    expiresAt: row.expires_at ?? null,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
  };
}

export class LinkedInTokenRepository {
  constructor(private readonly db: Database.Database) {}

  findByUser(userId: string): LinkedInTokenRecord | null {
    const row = this.db.prepare('SELECT * FROM linkedin_tokens WHERE user_id = ?').get(userId) as LinkedInTokenRow | undefined;
    return row ? mapRow(row) : null;
  }

  upsert(userId: string, encryptedAccessToken: string, personUrn: string | null, expiresAt: string | null, now: string): void {
    const existing = this.findByUser(userId);
    if (existing) {
      this.db.prepare(
        'UPDATE linkedin_tokens SET encrypted_access_token = ?, person_urn = ?, expires_at = ?, updated_at = ? WHERE user_id = ?',
      ).run(encryptedAccessToken, personUrn, expiresAt, now, userId);
    } else {
      this.db.prepare(
        'INSERT INTO linkedin_tokens (user_id, encrypted_access_token, person_urn, expires_at, connected_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(userId, encryptedAccessToken, personUrn, expiresAt, now, now);
    }
  }

  delete(userId: string): void {
    this.db.prepare('DELETE FROM linkedin_tokens WHERE user_id = ?').run(userId);
  }

  updatePersonUrn(userId: string, personUrn: string, updatedAt: string): void {
    this.db.prepare(
      'UPDATE linkedin_tokens SET person_urn = ?, updated_at = ? WHERE user_id = ?',
    ).run(personUrn, updatedAt, userId);
  }
}
