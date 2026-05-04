import { describe, expect, it } from 'vitest';
import { EncryptionService } from '../security/encryption.js';

describe('EncryptionService', () => {
  it('round-trips secrets and does not keep plaintext visible', () => {
    const service = new EncryptionService('a long secret used only for unit tests');
    const encrypted = service.encrypt('foundry-key');
    expect(encrypted).not.toContain('foundry-key');
    expect(service.decrypt(encrypted)).toBe('foundry-key');
  });
});
