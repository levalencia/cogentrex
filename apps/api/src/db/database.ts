import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createAdapter, type DbAdapter } from './adapter.js';
import { schemaSql } from './schema.sql.js';

export class AppDatabase {
  readonly adapter: DbAdapter;

  constructor(connectionString: string) {
    const path = connectionString.startsWith('sqlite://') ? connectionString.slice(9) : connectionString;
    if (!connectionString.startsWith('postgresql://') && !connectionString.startsWith('postgres://')) {
      if (path !== ':memory:') {
        mkdirSync(dirname(path), { recursive: true });
      }
    }
    this.adapter = createAdapter(connectionString);
  }

  async init(): Promise<void> {
    await this.adapter.exec(schemaSql);

    // SQLite-specific migrations (no-op on PostgreSQL since PRAGMA is ignored)
    try {
      const hasPinned = await this.adapter.getOne(
        "SELECT 1 FROM pragma_table_info('conversations') WHERE name = 'is_pinned'",
      );
      if (!hasPinned) {
        await this.adapter.exec("ALTER TABLE conversations ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasResearchJobs = await this.adapter.getOne(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='research_jobs'",
      );
      if (!hasResearchJobs) {
        await this.adapter.exec(`
          CREATE TABLE IF NOT EXISTS research_jobs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            conversation_id TEXT,
            provider_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            question TEXT NOT NULL,
            plan_json TEXT,
            answer TEXT,
            sources_json TEXT,
            reasoning_json TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
          );
          CREATE INDEX IF NOT EXISTS research_jobs_user_status ON research_jobs(user_id, status);
        `);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasProviderCapabilities = await this.adapter.getOne(
        "SELECT 1 FROM pragma_table_info('providers') WHERE name = 'supports_streaming'",
      );
      if (!hasProviderCapabilities) {
        await this.adapter.exec(`
          ALTER TABLE providers ADD COLUMN default_for_mode TEXT;
          ALTER TABLE providers ADD COLUMN supports_streaming INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE providers ADD COLUMN supports_vision INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE providers ADD COLUMN supports_tools INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE providers ADD COLUMN supports_search INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE providers ADD COLUMN test_status TEXT;
          ALTER TABLE providers ADD COLUMN tested_at TEXT;
        `);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasProviderUsage = await this.adapter.getOne(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='provider_usage'",
      );
      if (!hasProviderUsage) {
        await this.adapter.exec(`
          CREATE TABLE IF NOT EXISTS provider_usage (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            provider_id TEXT NOT NULL,
            date TEXT NOT NULL,
            request_count INTEGER NOT NULL DEFAULT 0,
            token_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
            UNIQUE(user_id, provider_id, date)
          );
          CREATE INDEX IF NOT EXISTS provider_usage_user_date ON provider_usage(user_id, date);
        `);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasIsGlobal = await this.adapter.getOne(
        "SELECT 1 FROM pragma_table_info('providers') WHERE name = 'is_global'",
      );
      if (!hasIsGlobal) {
        await this.adapter.exec(`ALTER TABLE providers ADD COLUMN is_global INTEGER NOT NULL DEFAULT 0;`);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasSupportsImage = await this.adapter.getOne(
        "SELECT 1 FROM pragma_table_info('providers') WHERE name = 'supports_image'",
      );
      if (!hasSupportsImage) {
        await this.adapter.exec(`ALTER TABLE providers ADD COLUMN supports_image INTEGER NOT NULL DEFAULT 0;`);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasSupportsVideo = await this.adapter.getOne(
        "SELECT 1 FROM pragma_table_info('providers') WHERE name = 'supports_video'",
      );
      if (!hasSupportsVideo) {
        await this.adapter.exec(`ALTER TABLE providers ADD COLUMN supports_video INTEGER NOT NULL DEFAULT 0;`);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasRequestMetrics = await this.adapter.getOne(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='request_metrics'",
      );
      if (!hasRequestMetrics) {
        await this.adapter.exec(`
          CREATE TABLE IF NOT EXISTS request_metrics (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            conversation_id TEXT,
            message_id TEXT,
            provider_id TEXT,
            model TEXT,
            mode TEXT,
            step TEXT NOT NULL,
            duration_ms INTEGER,
            prompt_tokens INTEGER,
            completion_tokens INTEGER,
            total_tokens INTEGER,
            ttft_ms INTEGER,
            tps REAL,
            metadata_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
          );
          CREATE INDEX IF NOT EXISTS request_metrics_conversation ON request_metrics(conversation_id);
          CREATE INDEX IF NOT EXISTS request_metrics_user_created ON request_metrics(user_id, created_at);
        `);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasMediaArtifacts = await this.adapter.getOne(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='media_artifacts'",
      );
      if (!hasMediaArtifacts) {
        await this.adapter.exec(`
          CREATE TABLE IF NOT EXISTS media_artifacts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            conversation_id TEXT,
            prompt TEXT NOT NULL,
            type TEXT NOT NULL,
            provider_id TEXT NOT NULL,
            blob_url TEXT,
            local_path TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
            FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS media_artifacts_conversation ON media_artifacts(conversation_id);
        `);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasSocialConfigs = await this.adapter.getOne(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='social_configs'",
      );
      if (!hasSocialConfigs) {
        await this.adapter.exec(`
          CREATE TABLE IF NOT EXISTS social_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            system_prompt TEXT NOT NULL DEFAULT '',
            is_enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, platform)
          );
          CREATE INDEX IF NOT EXISTS social_configs_user ON social_configs(user_id);
        `);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasProjects = await this.adapter.getOne(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='projects'",
      );
      if (!hasProjects) {
        await this.adapter.exec(`
          CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id);
        `);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasProjectId = await this.adapter.getOne(
        "SELECT 1 FROM pragma_table_info('conversations') WHERE name = 'project_id'",
      );
      if (!hasProjectId) {
        await this.adapter.exec(`ALTER TABLE conversations ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;`);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasLinkedInTokens = await this.adapter.getOne(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='linkedin_tokens'",
      );
      if (!hasLinkedInTokens) {
        await this.adapter.exec(`
          CREATE TABLE IF NOT EXISTS linkedin_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            encrypted_access_token TEXT NOT NULL,
            person_urn TEXT,
            expires_at TEXT,
            connected_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasScheduledPosts = await this.adapter.getOne(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='scheduled_posts'",
      );
      if (!hasScheduledPosts) {
        await this.adapter.exec(`
          CREATE TABLE IF NOT EXISTS scheduled_posts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            content TEXT NOT NULL,
            image_artifact_id TEXT,
            post_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            posted_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS scheduled_posts_user_status ON scheduled_posts(user_id, status);
          CREATE INDEX IF NOT EXISTS scheduled_posts_pending ON scheduled_posts(status, post_at);
        `);
      }
    } catch { /* ignored on PostgreSQL */ }

    try {
      const hasArtifacts = await this.adapter.getOne(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='artifacts'",
      );
      if (!hasArtifacts) {
        await this.adapter.exec(`
          CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            conversation_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            type TEXT NOT NULL,
            filename TEXT NOT NULL,
            language TEXT,
            content TEXT NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS artifacts_conversation ON artifacts(conversation_id);
        `);
      }
    } catch { /* ignored on PostgreSQL */ }
  }

  async close(): Promise<void> {
    await this.adapter.close();
  }
}
