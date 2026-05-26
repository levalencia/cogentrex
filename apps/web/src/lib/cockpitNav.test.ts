import { describe, expect, it } from 'vitest';
import { getCockpitNavItems } from './cockpitNav';

describe('getCockpitNavItems', () => {
  it('keeps end-user cockpit navigation focused on skills, chat, runs, and library', () => {
    const items = getCockpitNavItems('USER', '/runs');

    expect(items.map((item) => item.label)).toEqual(['Skills', 'Chat', 'Runs', 'Library']);
    expect(items.find((item) => item.label === 'Skills')).toMatchObject({ href: '/skills', isActive: false });
    expect(items.find((item) => item.label === 'Chat')).toMatchObject({ href: '/chats', isActive: false });
    expect(items.find((item) => item.label === 'Runs')).toMatchObject({ href: '/runs', isActive: true });
    expect(items.some((item) => item.label.includes('Admin'))).toBe(false);
  });

  it('treats both the root dashboard and /skills alias as the Skills cockpit', () => {
    expect(getCockpitNavItems('USER', '/').find((item) => item.label === 'Skills')).toMatchObject({ href: '/skills', isActive: true });
    expect(getCockpitNavItems('USER', '/skills').find((item) => item.label === 'Skills')).toMatchObject({ href: '/skills', isActive: true });
  });

  it('adds admin surfaces only for admins and marks nested admin routes active', () => {
    const items = getCockpitNavItems('ADMIN', '/settings/admin/skills');

    expect(items.map((item) => item.label)).toEqual(['Skills', 'Chat', 'Runs', 'Library', 'Admin']);
    expect(items.find((item) => item.label === 'Admin')).toMatchObject({ href: '/settings/admin/skills', isActive: true });
  });
});
