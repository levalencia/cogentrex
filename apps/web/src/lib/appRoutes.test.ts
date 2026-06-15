import { describe, expect, it } from 'vitest';
import { getAppShellSurface } from './appRoutes';

describe('getAppShellSurface', () => {
  it('uses Chat as the home/default surface', () => {
    expect(getAppShellSurface('/', undefined)).toBe('chat');
    expect(getAppShellSurface('/chats', undefined)).toBe('chat');
    expect(getAppShellSurface('/chats/cnv_123', 'cnv_123')).toBe('chat');
  });

  it('routes legacy workflow and public skill URLs through Chat', () => {
    expect(getAppShellSurface('/workflows', undefined)).toBe('chat');
    expect(getAppShellSurface('/skills', undefined)).toBe('chat');
    expect(getAppShellSurface('/workflows/deep-research', undefined)).toBe('chat');
    expect(getAppShellSurface('/skills/deep-research', undefined)).toBe('chat');
  });

  it('keeps Runs and Library as secondary surfaces', () => {
    expect(getAppShellSurface('/runs', undefined)).toBe('runs');
    expect(getAppShellSurface('/library', undefined)).toBe('library');
  });
});
