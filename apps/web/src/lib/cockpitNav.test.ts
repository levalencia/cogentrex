import { describe, expect, it } from 'vitest';
import { getCockpitNavItems } from './cockpitNav';

describe('getCockpitNavItems', () => {
  it('keeps end-user cockpit navigation focused on start, chat, runs, and library', () => {
    const items = getCockpitNavItems('USER', '/runs');

    expect(items.map((item) => item.label)).toEqual(['Start', 'Chat', 'Runs', 'Library']);
    expect(items.find((item) => item.label === 'Start')).toMatchObject({ href: '/workflows', description: 'Choose a mode or template', isActive: false });
    expect(items.find((item) => item.label === 'Chat')).toMatchObject({ href: '/chats', isActive: false });
    expect(items.find((item) => item.label === 'Runs')).toMatchObject({ href: '/runs', isActive: true });
    expect(items.some((item) => item.label.includes('Admin'))).toBe(false);
  });

  it('treats the root dashboard, canonical /workflows route, and /skills alias as the Start cockpit', () => {
    expect(getCockpitNavItems('USER', '/').find((item) => item.label === 'Start')).toMatchObject({ href: '/workflows', isActive: true });
    expect(getCockpitNavItems('USER', '/workflows').find((item) => item.label === 'Start')).toMatchObject({ href: '/workflows', isActive: true });
    expect(getCockpitNavItems('USER', '/workflows/deep-research').find((item) => item.label === 'Start')).toMatchObject({ href: '/workflows', isActive: true });
    expect(getCockpitNavItems('USER', '/skills').find((item) => item.label === 'Start')).toMatchObject({ href: '/workflows', isActive: true });
  });

  it('adds admin surfaces only for admins and marks nested admin routes active', () => {
    const items = getCockpitNavItems('ADMIN', '/settings/admin/skills');

    expect(items.map((item) => item.label)).toEqual(['Start', 'Chat', 'Runs', 'Library', 'Admin']);
    expect(items.find((item) => item.label === 'Admin')).toMatchObject({ href: '/settings/admin/skills', description: 'Skill packages, providers, analytics', isActive: true });
  });
});
