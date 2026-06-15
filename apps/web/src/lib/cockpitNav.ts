import type { PublicUser } from '@cogentrex/shared';

export interface CockpitNavItem {
  id: 'chat' | 'runs' | 'library' | 'admin';
  label: string;
  href: string;
  description: string;
  isActive: boolean;
}

function isActivePath(pathname: string | null | undefined, href: string): boolean {
  const current = pathname ?? '/';
  if (href === '/chats' && current === '/') return true;
  if (href === '/') return current === '/';
  return current === href || current.startsWith(`${href}/`);
}

export function getCockpitNavItems(role: PublicUser['role'] | undefined, pathname: string | null | undefined): CockpitNavItem[] {
  const items: Array<Omit<CockpitNavItem, 'isActive'>> = [
    {
      id: 'chat',
      label: 'Chat',
      href: '/chats',
      description: 'Chat with Cogentrex',
    },

    {
      id: 'runs',
      label: 'Runs',
      href: '/runs',
      description: 'Auditable task history',
    },
    {
      id: 'library',
      label: 'Library',
      href: '/library',
      description: 'Reusable saved outputs',
    },
  ];

  if (role === 'ADMIN') {
    items.push({
      id: 'admin',
      label: 'Admin',
      href: '/settings/admin/skills',
      description: 'Skill packages, providers, analytics',
    });
  }

  return items.map((item) => ({
    ...item,
    isActive: item.id === 'admin'
      ? Boolean(pathname?.startsWith('/settings/admin'))
      : isActivePath(pathname, item.href),
  }));
}
