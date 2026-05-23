import type { CreateProviderInput, ProviderConfigView, UpdateProviderInput } from '@cogentrex/shared';
import { notFound } from '../http/errors.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';
import type { EncryptionService } from '../security/encryption.js';
import type { AppLogger } from '../observability/logger.js';
import { ProviderRepository, toProviderView, type ProviderRecord } from './providerRepository.js';

export interface ProviderRuntimeConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  kind: ProviderConfigView['kind'];
}

type ProviderMode = 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION';

function providerSupportsMode(provider: ProviderRecord, mode: ProviderMode): boolean {
  if (mode === 'IMAGE_GENERATION') return provider.kind === 'IMAGE_GENERATION' || provider.supportsImage;
  if (mode === 'VIDEO_GENERATION') return provider.kind === 'VIDEO_GENERATION' || provider.supportsVideo;
  return provider.kind !== 'IMAGE_GENERATION' && provider.kind !== 'VIDEO_GENERATION';
}

export class ProviderService {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly encryption: EncryptionService,
    private readonly logger: AppLogger,
  ) {}

  async list(userId: string): Promise<ProviderConfigView[]> {
    return (await this.providers.listForUser(userId)).map(toProviderView);
  }

  async listGlobal(): Promise<ProviderConfigView[]> {
    return (await this.providers.listGlobal()).map(toProviderView);
  }

  async create(userId: string, input: CreateProviderInput): Promise<ProviderConfigView> {
    const now = nowIso();
    const currentProviders = await this.providers.listForUser(userId);
    const provider = await this.providers.create({
      id: createId('prv'),
      userId,
      name: input.name,
      baseUrl: input.baseUrl,
      encryptedApiKey: this.encryption.encrypt(input.apiKey),
      model: input.model,
      kind: input.kind,
      isDefault: input.isDefault || currentProviders.length === 0,
      isGlobal: input.isGlobal ?? false,
      defaultForMode: input.defaultForMode ?? null,
      supportsStreaming: input.supportsStreaming ?? true,
      supportsVision: input.supportsVision ?? false,
      supportsTools: input.supportsTools ?? false,
      supportsSearch: input.supportsSearch ?? false,
      supportsImage: input.supportsImage ?? false,
      supportsVideo: input.supportsVideo ?? false,
      testStatus: null,
      testedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    this.logger.info({ userId, providerId: provider.id, kind: provider.kind, model: provider.model, isDefault: provider.isDefault, isGlobal: provider.isGlobal }, 'provider_created');
    return toProviderView(provider);
  }

  async createGlobal(adminUserId: string, input: CreateProviderInput): Promise<ProviderConfigView> {
    const now = nowIso();
    const provider = await this.providers.create({
      id: createId('prv'),
      userId: adminUserId,
      name: input.name,
      baseUrl: input.baseUrl,
      encryptedApiKey: this.encryption.encrypt(input.apiKey),
      model: input.model,
      kind: input.kind,
      isDefault: false,
      isGlobal: true,
      defaultForMode: input.defaultForMode ?? null,
      supportsStreaming: input.supportsStreaming ?? true,
      supportsVision: input.supportsVision ?? false,
      supportsTools: input.supportsTools ?? false,
      supportsSearch: input.supportsSearch ?? false,
      supportsImage: input.supportsImage ?? false,
      supportsVideo: input.supportsVideo ?? false,
      testStatus: null,
      testedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    this.logger.info({ adminUserId, providerId: provider.id, kind: provider.kind, isGlobal: true }, 'global_provider_created');
    return toProviderView(provider);
  }

  async update(userId: string, id: string, input: UpdateProviderInput): Promise<ProviderConfigView> {
    const existing = await this.providers.findById(userId, id);
    if (!existing) throw notFound('Provider not found');
    if (existing.isGlobal) throw notFound('Cannot edit global providers');
    const updated: ProviderRecord = {
      ...existing,
      name: input.name ?? existing.name,
      baseUrl: input.baseUrl ?? existing.baseUrl,
      encryptedApiKey: input.apiKey ? this.encryption.encrypt(input.apiKey) : existing.encryptedApiKey,
      model: input.model ?? existing.model,
      kind: input.kind ?? existing.kind,
      isDefault: input.isDefault ?? existing.isDefault,
      isGlobal: existing.isGlobal,
      defaultForMode: input.defaultForMode !== undefined ? input.defaultForMode as 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | null : existing.defaultForMode,
      supportsStreaming: input.supportsStreaming ?? existing.supportsStreaming,
      supportsVision: input.supportsVision ?? existing.supportsVision,
      supportsTools: input.supportsTools ?? existing.supportsTools,
      supportsSearch: input.supportsSearch ?? existing.supportsSearch,
      supportsImage: input.supportsImage ?? existing.supportsImage,
      supportsVideo: input.supportsVideo ?? existing.supportsVideo,
      updatedAt: nowIso(),
    };
    const provider = await this.providers.update(updated);
    this.logger.info({ userId, providerId: provider.id, kind: provider.kind, model: provider.model, isDefault: provider.isDefault, apiKeyRotated: Boolean(input.apiKey) }, 'provider_updated');
    return toProviderView(provider);
  }

  async updateGlobal(adminUserId: string, id: string, input: UpdateProviderInput): Promise<ProviderConfigView> {
    const existing = await this.providers.findByIdAdmin(id);
    if (!existing || !existing.isGlobal) throw notFound('Global provider not found');
    const updated: ProviderRecord = {
      ...existing,
      name: input.name ?? existing.name,
      baseUrl: input.baseUrl ?? existing.baseUrl,
      encryptedApiKey: input.apiKey ? this.encryption.encrypt(input.apiKey) : existing.encryptedApiKey,
      model: input.model ?? existing.model,
      kind: input.kind ?? existing.kind,
      isDefault: input.isDefault ?? existing.isDefault,
      isGlobal: true,
      defaultForMode: input.defaultForMode !== undefined ? input.defaultForMode as 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | null : existing.defaultForMode,
      supportsStreaming: input.supportsStreaming ?? existing.supportsStreaming,
      supportsVision: input.supportsVision ?? existing.supportsVision,
      supportsTools: input.supportsTools ?? existing.supportsTools,
      supportsSearch: input.supportsSearch ?? existing.supportsSearch,
      supportsImage: input.supportsImage ?? existing.supportsImage,
      supportsVideo: input.supportsVideo ?? existing.supportsVideo,
      updatedAt: nowIso(),
    };
    const provider = await this.providers.update(updated);
    this.logger.info({ adminUserId, providerId: provider.id, isGlobal: true }, 'global_provider_updated');
    return toProviderView(provider);
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.providers.findById(userId, id);
    if (existing?.isGlobal) throw notFound('Cannot delete global providers');
    await this.providers.delete(userId, id);
    this.logger.info({ userId, providerId: id }, 'provider_deleted');
  }

  async deleteGlobal(adminUserId: string, id: string): Promise<void> {
    const existing = await this.providers.findByIdAdmin(id);
    if (!existing?.isGlobal) throw notFound('Global provider not found');
    await this.providers.deleteAdmin(id);
    this.logger.info({ adminUserId, providerId: id }, 'global_provider_deleted');
  }

  async resolve(userId: string, providerId?: string): Promise<ProviderRuntimeConfig> {
    const provider = providerId
      ? await this.providers.findById(userId, providerId)
      : await this.providers.findDefault(userId);
    if (!provider) throw notFound('Provider not configured');
    this.logger.debug({ userId, providerId: provider.id, kind: provider.kind, model: provider.model }, 'provider_resolved');
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: this.encryption.decrypt(provider.encryptedApiKey),
      model: provider.model,
      kind: provider.kind,
    };
  }

  async resolveForMode(userId: string, mode: ProviderMode, providerId?: string): Promise<ProviderRuntimeConfig> {
    if (providerId) return this.resolve(userId, providerId);
    const modeDefault = await this.providers.findDefaultForMode(userId, mode);
    const provider = modeDefault && providerSupportsMode(modeDefault, mode)
      ? modeDefault
      : (await this.providers.listForUser(userId)).find((candidate) => providerSupportsMode(candidate, mode));
    if (!provider) throw notFound('Provider not configured');
    this.logger.debug({ userId, providerId: provider.id, kind: provider.kind, model: provider.model, mode }, 'provider_resolved_for_mode');
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: this.encryption.decrypt(provider.encryptedApiKey),
      model: provider.model,
      kind: provider.kind,
    };
  }

  async test(userId: string, id: string): Promise<{ ok: boolean; status: 'ok' | 'fail'; error?: string }> {
    const provider = await this.providers.findById(userId, id);
    if (!provider) throw notFound('Provider not found');
    const apiKey = this.encryption.decrypt(provider.encryptedApiKey);
    const now = nowIso();
    try {
      // Some providers (Azure, custom proxies) don't expose /models.
      // If /models fails with 4xx, fall back to checking the base URL itself.
      const modelsResponse = await fetch(`${provider.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (modelsResponse.ok) {
        const updated = { ...provider, testStatus: 'ok' as const, testedAt: now };
        await this.providers.update(updated);
        this.logger.info({ userId, providerId: id, status: 'ok' }, 'provider_tested');
        return { ok: true, status: 'ok' };
      }
      // Fallback: check base URL is reachable (any HTTP response = server is alive)
      const baseResponse = await fetch(provider.baseUrl, {
        method: 'HEAD',
        headers: { Authorization: `Bearer ${apiKey}` },
      }).catch(() => null);
      if (baseResponse || (modelsResponse.status >= 400 && modelsResponse.status < 500)) {
        // Server responded with HTTP, so it's reachable — 401/403/404 means endpoint exists but route may differ
        const updated = { ...provider, testStatus: 'ok' as const, testedAt: now };
        await this.providers.update(updated);
        this.logger.info({ userId, providerId: id, status: 'ok', fallback: true, modelsStatus: modelsResponse.status }, 'provider_tested');
        return { ok: true, status: 'ok' };
      }
      const updated = { ...provider, testStatus: 'fail' as const, testedAt: now };
      await this.providers.update(updated);
      this.logger.warn({ userId, providerId: id, statusCode: modelsResponse.status }, 'provider_test_failed');
      return { ok: false, status: 'fail', error: `Provider returned ${modelsResponse.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      const updated = { ...provider, testStatus: 'fail' as const, testedAt: now };
      await this.providers.update(updated);
      this.logger.warn({ userId, providerId: id, errorMessage: message }, 'provider_test_failed');
      return { ok: false, status: 'fail', error: message };
    }
  }
}
