export const schemaSql = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'USER',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
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

CREATE INDEX IF NOT EXISTS oauth_accounts_user ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  kind TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_global INTEGER NOT NULL DEFAULT 0,
  default_for_mode TEXT,
  supports_streaming INTEGER NOT NULL DEFAULT 1,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  supports_tools INTEGER NOT NULL DEFAULT 0,
  supports_search INTEGER NOT NULL DEFAULT 0,
  supports_image INTEGER NOT NULL DEFAULT 0,
  supports_video INTEGER NOT NULL DEFAULT 0,
  test_status TEXT,
  tested_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS providers_one_default_per_user
ON providers(user_id)
WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  visibility TEXT NOT NULL,
  category TEXT,
  icon TEXT,
  input_schema_json TEXT,
  output_contract_json TEXT,
  tool_requirements_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS skills_status_visibility ON skills(status, visibility);

CREATE TABLE IF NOT EXISTS skill_routes (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL,
  default_provider_id TEXT,
  search_profile TEXT,
  max_budget_cents INTEGER,
  config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  FOREIGN KEY (default_provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS skill_routes_skill ON skill_routes(skill_id);

CREATE TABLE IF NOT EXISTS skill_files (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text/markdown',
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  executable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  UNIQUE(skill_id, path)
);

CREATE INDEX IF NOT EXISTS skill_files_skill_path ON skill_files(skill_id, path);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 0,
  share_token TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skill_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_slug TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  conversation_id TEXT,
  job_id TEXT,
  provider_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  error_message TEXT,
  observability_json TEXT,
  event_sequence INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS skill_runs_user_started ON skill_runs(user_id, started_at);
CREATE INDEX IF NOT EXISTS skill_runs_conversation ON skill_runs(conversation_id);

CREATE TABLE IF NOT EXISTS skill_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  label TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES skill_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS skill_run_events_run_sequence_unique ON skill_run_events(run_id, sequence);
CREATE INDEX IF NOT EXISTS skill_run_events_run_sequence ON skill_run_events(run_id, sequence);
CREATE INDEX IF NOT EXISTS skill_run_events_user_created ON skill_run_events(user_id, created_at);

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

CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  snippet TEXT,
  excerpt TEXT,
  channel TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS research_sources_conversation ON research_sources(conversation_id);

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
  tags_json TEXT,
  project_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS artifacts_conversation ON artifacts(conversation_id);

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
`;

export const postgresSchemaSql = schemaSql
  .replace(/^PRAGMA .*;\n/gm, '')
  .replaceAll('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY');
