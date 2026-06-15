import { describe, expect, it } from 'vitest';
import { getCockpitNavItems } from './cockpitNav';

describe('getCockpitNavItems', () => {
  it('keeps end-user cockpit navigation focused on chat, runs, and library', () => {
    const items = getCockpitNavItems('USER', '/runs');

    expect(items.map((item) => item.label)).toEqual(['Chat', 'Runs', 'Library']);
    expect(items.find((item) => item.label === 'Chat')).toMatchObject({ href: '/chats', description: 'Chat with Cogentrex', isActive: false });
    expect(items.find((item) => item.label === 'Runs')).toMatchObject({ href: '/runs', isActive: true });
    expect(items.some((item) => item.label === 'Start')).toBe(false);
    expect(items.some((item) => item.label.includes('Admin'))).toBe(false);
  });

  it('treats root and legacy launcher URLs as Chat-first surfaces', () => {
    expect(getCockpitNavItems('USER', '/').find((item) => item.label === 'Chat')).toMatchObject({ href: '/chats', isActive: true });
    expect(getCockpitNavItems('USER', '/workflows').find((item) => item.label === 'Chat')).toMatchObject({ href: '/chats', isActive: false });
    expect(getCockpitNavItems('USER', '/workflows/deep-research').some((item) => item.label === 'Start')).toBe(false);
    expect(getCockpitNavItems('USER', '/skills').some((item) => item.label === 'Start')).toBe(false);
  });

  it('adds admin surfaces only for admins and marks nested admin routes active', () => {
    const items = getCockpitNavItems('ADMIN', '/settings/admin/skills');

    expect(items.map((item) => item.label)).toEqual(['Chat', 'Runs', 'Library', 'Admin']);
    expect(items.find((item) => item.label === 'Admin')).toMatchObject({ href: '/settings/admin/skills', description: 'Skill packages, providers, analytics', isActive: true });
  });
});
