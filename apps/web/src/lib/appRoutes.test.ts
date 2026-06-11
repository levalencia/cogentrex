import { describe, expect, it } from 'vitest';
import { getAppShellSurface } from './appRoutes';

describe('getAppShellSurface', () => {
  it('uses Chat as the home/default surface instead of the Start launcher', () => {
    expect(getAppShellSurface('/', undefined)).toBe('chat');
    expect(getAppShellSurface('/chats', undefined)).toBe('chat');
    expect(getAppShellSurface('/chats/cnv_123', 'cnv_123')).toBe('chat');
  });

  it('keeps Start as a secondary explicit launcher route', () => {
    expect(getAppShellSurface('/workflows', undefined)).toBe('start');
    expect(getAppShellSurface('/skills', undefined)).toBe('start');
    expect(getAppShellSurface('/workflows/deep-research', undefined)).toBe('skillDetail');
  });
});
