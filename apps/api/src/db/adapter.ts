import { Pool, type PoolClient } from 'pg';
import Database from 'better-sqlite3';

export interface PreparedStatement {
  run(...args: any[]): Promise<{ changes?: number; lastID?: number | undefined }>;
  get(...args: any[]): Promise<any>;
  all(...args: any[]): Promise<any[]>;
}

export interface DbAdapter {
  prepare(sql: string): PreparedStatement;
  query<T = any>(sql: string, params?: any[] | Record<string, any> | any): Promise<T[]>;
  getOne<T = any>(sql: string, params?: any[] | Record<string, any> | any): Promise<T | undefined>;
  execute(sql: string, params?: any[] | Record<string, any> | any): Promise<{ changes?: number; lastID?: number | undefined }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function toPositionalParams(sql: string, params?: any[] | Record<string, any> | any): { sql: string; values: any[] } {
  if (!params) return { sql, values: [] };
  if (Array.isArray(params)) return { sql, values: params };
  if (typeof params === 'object' && params !== null) {
    const names: string[] = [];
    const values: any[] = [];
    const regex = /@(\w+)/g;
    let m;
    while ((m = regex.exec(sql)) !== null) {
      names.push(m[1]!);
    }
    for (let i = 0; i < names.length; i++) {
      values.push((params as Record<string, any>)[names[i]!]);
    }
    let idx = 1;
    const newSql = sql.replace(/@\w+/g, () => `$${idx++}`);
    return { sql: newSql, values };
  }
  return { sql, values: [params] };
}

class PostgresAdapter implements DbAdapter {
  private pool: Pool | null;
  private client: PoolClient | null;
  private txDepth = 0;

  constructor(pool?: Pool | null, client?: PoolClient | null) {
    this.pool = pool ?? null;
    this.client = client ?? null;
  }

  private getClient(): PoolClient {
    if (this.client) return this.client;
    if (!this.pool) throw new Error('No database connection available');
    return this.pool as unknown as PoolClient;
  }

  prepare(sql: string): PreparedStatement {
    return {
      run: async (...args: any[]) => {
        const client = this.getClient();
        const { sql: finalSql, values } = toPositionalParams(sql, args[0]);
        const result = await client.query(finalSql, values);
        if (result.rowCount != null) {
          return { changes: result.rowCount };
        }
        return {};
      },
      get: async (...args: any[]) => {
        const client = this.getClient();
        const { sql: finalSql, values } = toPositionalParams(sql, args[0]);
        const result = await client.query(finalSql, values);
        return result.rows[0] ?? undefined;
      },
      all: async (...args: any[]) => {
        const client = this.getClient();
        const { sql: finalSql, values } = toPositionalParams(sql, args[0]);
        const result = await client.query(finalSql, values);
        return result.rows;
      },
    };
  }

  async query<T = any>(sql: string, params?: any[] | Record<string, any> | any): Promise<T[]> {
    const client = this.getClient();
    const { sql: finalSql, values } = toPositionalParams(sql, params);
    const result = await client.query(finalSql, values);
    return result.rows;
  }

  async getOne<T = any>(sql: string, params?: any[] | Record<string, any> | any): Promise<T | undefined> {
    const client = this.getClient();
    const { sql: finalSql, values } = toPositionalParams(sql, params);
    const result = await client.query(finalSql, values);
    return result.rows[0] ?? undefined;
  }

  async execute(sql: string, rawParams?: any[] | Record<string, any> | any): Promise<{ changes?: number; lastID?: number | undefined }> {
    const client = this.getClient();
    const { sql: finalSql, values } = toPositionalParams(sql, rawParams);
    const result = await client.query(finalSql, values);
    if (result.rowCount != null) {
      return { changes: result.rowCount };
    }
    return {};
  }

  async exec(sql: string): Promise<void> {
    const client = this.getClient();
    await client.query(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.txDepth > 0) {
      this.txDepth++;
      try {
        return await fn();
      } finally {
        this.txDepth--;
      }
    }
    if (!this.pool) throw new Error('No pool available for transaction');
    const client = await this.pool.connect();
    await client.query('BEGIN');
    const txAdapter = new PostgresAdapter(null, client);
    txAdapter.txDepth = 1;
    try {
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

class SqliteAdapter implements DbAdapter {
  private txDepth = 0;

  constructor(private db: Database.Database) {}

  prepare(sql: string): PreparedStatement {
    const stmt = this.db.prepare(sql);
    return {
      run: async (...args: any[]) => {
        const result = stmt.run(...args);
        const out: { changes?: number; lastID?: number | undefined } = {};
        if (result.changes != null) out.changes = result.changes;
        const rid = Number(result.lastInsertRowid);
        if (rid !== 0) out.lastID = rid;
        return out;
      },
      get: async (...args: any[]) => stmt.get(...args),
      all: async (...args: any[]) => stmt.all(...args),
    };
  }

  async query<T = any>(sql: string, params?: any[] | Record<string, any> | any): Promise<T[]> {
    const stmt = this.prepare(sql);
    return stmt.all(params) as Promise<T[]>;
  }

  async getOne<T = any>(sql: string, params?: any[] | Record<string, any> | any): Promise<T | undefined> {
    const stmt = this.prepare(sql);
    return stmt.get(params) as Promise<T | undefined>;
  }

  async execute(sql: string, params?: any[] | Record<string, any> | any): Promise<{ changes?: number; lastID?: number | undefined }> {
    const stmt = this.prepare(sql);
    return stmt.run(params);
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.txDepth > 0) {
      this.txDepth++;
      try {
        return await fn();
      } finally {
        this.txDepth--;
      }
    }
    this.db.exec('BEGIN');
    this.txDepth = 1;
    try {
      const result = await fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this.txDepth = 0;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export function createAdapter(connectionString: string): DbAdapter {
  if (connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://')) {
    const pool = new Pool({ connectionString });
    return new PostgresAdapter(pool);
  }
  const filePath = connectionString.startsWith('sqlite://') ? connectionString.slice(9) : connectionString;
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return new SqliteAdapter(db);
}
