import { describe, expect, it } from 'vitest';
import { hashForLog, redactForLog } from '../observability/logger.js';

describe('logger helpers', () => {
  it('redacts known secret fields recursively', () => {
    expect(redactForLog({ apiKey: 'secret', nested: { password: 'hidden', safe: 'ok' } })).toEqual({
      apiKey: '[REDACTED]',
      nested: { password: '[REDACTED]', safe: 'ok' },
    });
  });

  it('hashes values deterministically without exposing the input', () => {
    const hash = hashForLog('research prompt');
    expect(hash).toBe(hashForLog('research prompt'));
    expect(hash).not.toContain('research');
  });
});
