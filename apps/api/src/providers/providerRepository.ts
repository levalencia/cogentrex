import type { DbAdapter } from '../db/adapter.js';
import type { ProviderConfigView } from '@cogentrex/shared';

export interface ProviderRecord extends ProviderConfigView {
  userId: string;
  encryptedApiKey: string;
  updatedAt: string;
}

interface ProviderRow {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  encrypted_api_key: string;
  model: string;
  kind: ProviderConfigView['kind'];
  is_default: 0 | 1;
  is_global: 0 | 1;
  default_for_mode: string | null;
  supports_streaming: 0 | 1;
  supports_vision: 0 | 1;
  supports_tools: 0 | 1;
  supports_search: 0 | 1;
  supports_image: 0 | 1;
  supports_video: 0 | 1;
  test_status: string | null;
  tested_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapProvider(row: ProviderRow): ProviderRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    baseUrl: row.base_url,
    encryptedApiKey: row.encrypted_api_key,
    model: row.model,
    kind: row.kind,
    isDefault: row.is_default === 1,
    isGlobal: row.is_global === 1,
    defaultForMode: (row.default_for_mode as 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | null) ?? null,
    supportsStreaming: row.supports_streaming === 1,
    supportsVision: row.supports_vision === 1,
    supportsTools: row.supports_tools === 1,
    supportsSearch: row.supports_search === 1,
    supportsImage: row.supports_image === 1,
    supportsVideo: row.supports_video === 1,
    testStatus: (row.test_status as 'ok' | 'fail' | null) ?? null,
    testedAt: row.tested_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toProviderView(provider: ProviderRecord): ProviderConfigView {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    model: provider.model,
    kind: provider.kind,
    isDefault: provider.isDefault,
    isGlobal: provider.isGlobal,
    defaultForMode: provider.defaultForMode,
    supportsStreaming: provider.supportsStreaming,
    supportsVision: provider.supportsVision,
    supportsTools: provider.supportsTools,
    supportsSearch: provider.supportsSearch,
    supportsImage: provider.supportsImage,
    supportsVideo: provider.supportsVideo,
    testStatus: provider.testStatus,
    testedAt: provider.testedAt,
    createdAt: provider.createdAt,
  };
}

export class ProviderRepository {
  constructor(private readonly db: DbAdapter) {}

  async listForUser(userId: string): Promise<ProviderRecord[]>{
    const rows = await this.db.prepare(
      `SELECT * FROM providers WHERE user_id = ? OR is_global = 1
       ORDER BY is_default DESC, is_global DESC, created_at ASC`,
    ).all(userId) as ProviderRow[];
    return rows.map(mapProvider);
  }

  async listGlobal(): Promise<ProviderRecord[]>{
    const rows = await this.db.prepare(
      'SELECT * FROM providers WHERE is_global = 1 ORDER BY created_at ASC',
    ).all() as ProviderRow[];
    return rows.map(mapProvider);
  }

  async findById(userId: string, id: string): Promise<ProviderRecord | null>{
    const row = await this.db.prepare(
      'SELECT * FROM providers WHERE (user_id = ? OR is_global = 1) AND id = ?',
    ).get(userId, id) as ProviderRow | undefined;
    return row ? mapProvider(row) : null;
  }

  async findByIdAdmin(id: string): Promise<ProviderRecord | null>{
    const row = await this.db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as ProviderRow | undefined;
    return row ? mapProvider(row) : null;
  }

  async findDefault(userId: string): Promise<ProviderRecord | null>{
    const row = await this.db.prepare(
      'SELECT * FROM providers WHERE (user_id = ? OR is_global = 1) AND is_default = 1 LIMIT 1',
    ).get(userId) as ProviderRow | undefined;
    return row ? mapProvider(row) : null;
  }

  async findDefaultForMode(userId: string, mode: 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION'): Promise<ProviderRecord | null>{
    const row = await this.db.prepare(
      'SELECT * FROM providers WHERE (user_id = ? OR is_global = 1) AND default_for_mode = ? LIMIT 1',
    ).get(userId, mode) as ProviderRow | undefined;
    if (row) return mapProvider(row);
    return this.findDefault(userId);
  }

  async create(provider: ProviderRecord): Promise<ProviderRecord>{
    await this.db.transaction(async () => {
      if (provider.isDefault && !provider.isGlobal) {
        await this.db.prepare('UPDATE providers SET is_default = 0 WHERE user_id = ? AND is_global = 0').run(provider.userId);
      }
      await this.db.prepare(
        `INSERT INTO providers (
          id, user_id, name, base_url, encrypted_api_key, model, kind, is_default, is_global,
          default_for_mode, supports_streaming, supports_vision, supports_tools, supports_search,
          supports_image, supports_video, test_status, tested_at, created_at, updated_at
        ) VALUES (
          @id, @userId, @name, @baseUrl, @encryptedApiKey, @model, @kind, @isDefault, @isGlobal,
          @defaultForMode, @supportsStreaming, @supportsVision, @supportsTools, @supportsSearch,
          @supportsImage, @supportsVideo, @testStatus, @testedAt, @createdAt, @updatedAt
        )`,
      ).run({
        ...provider,
        isDefault: provider.isDefault ? 1 : 0,
        isGlobal: provider.isGlobal ? 1 : 0,
        supportsStreaming: provider.supportsStreaming ? 1 : 0,
        supportsVision: provider.supportsVision ? 1 : 0,
        supportsTools: provider.supportsTools ? 1 : 0,
        supportsSearch: provider.supportsSearch ? 1 : 0,
        supportsImage: provider.supportsImage ? 1 : 0,
        supportsVideo: provider.supportsVideo ? 1 : 0,
      });
    });
    return provider;
  }

  async update(provider: ProviderRecord): Promise<ProviderRecord>{
    await this.db.transaction(async () => {
      if (provider.isDefault && !provider.isGlobal) {
        await this.db.prepare('UPDATE providers SET is_default = 0 WHERE user_id = ? AND id != ? AND is_global = 0').run(provider.userId, provider.id);
      }
      await this.db.prepare(
        `UPDATE providers
         SET name = @name, base_url = @baseUrl, encrypted_api_key = @encryptedApiKey,
             model = @model, kind = @kind, is_default = @isDefault, is_global = @isGlobal,
             default_for_mode = @defaultForMode, supports_streaming = @supportsStreaming,
             supports_vision = @supportsVision, supports_tools = @supportsTools,
             supports_search = @supportsSearch, supports_image = @supportsImage,
             supports_video = @supportsVideo, test_status = @testStatus,
             tested_at = @testedAt, updated_at = @updatedAt
         WHERE id = @id`,
      ).run({
        ...provider,
        isDefault: provider.isDefault ? 1 : 0,
        isGlobal: provider.isGlobal ? 1 : 0,
        supportsStreaming: provider.supportsStreaming ? 1 : 0,
        supportsVision: provider.supportsVision ? 1 : 0,
        supportsTools: provider.supportsTools ? 1 : 0,
        supportsSearch: provider.supportsSearch ? 1 : 0,
        supportsImage: provider.supportsImage ? 1 : 0,
        supportsVideo: provider.supportsVideo ? 1 : 0,
      });
    });
    return provider;
  }

  async delete(userId: string, id: string): Promise<void>{
    await this.db.transaction(async () => {
      await this.db.prepare('DELETE FROM providers WHERE user_id = ? AND id = ? AND is_global = 0').run(userId, id);
      const remainingDefault = await this.db.prepare('SELECT 1 FROM providers WHERE user_id = ? AND is_default = 1 AND is_global = 0').get(userId);
      if (!remainingDefault) {
        const first = await this.db.prepare('SELECT id FROM providers WHERE user_id = ? AND is_global = 0 ORDER BY created_at ASC LIMIT 1').get(userId) as { id: string } | undefined;
        if (first) {
          await this.db.prepare('UPDATE providers SET is_default = 1 WHERE user_id = ? AND id = ?').run(userId, first.id);
        }
      }
    });
  }

  async deleteAdmin(id: string): Promise<void>{
    await this.db.prepare('DELETE FROM providers WHERE id = ?').run(id);
  }
}
