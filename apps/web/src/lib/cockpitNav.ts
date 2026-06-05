import type { PublicUser } from '@cogentrex/shared';

export interface CockpitNavItem {
  id: 'workflows' | 'chat' | 'runs' | 'library' | 'admin';
  label: string;
  href: string;
  description: string;
  isActive: boolean;
}

function isActivePath(pathname: string | null | undefined, href: string): boolean {
  const current = pathname ?? '/';
  if (href === '/') return current === '/';
  return current === href || current.startsWith(`${href}/`);
}

function isWorkflowRoute(pathname: string | null | undefined): boolean {
  const current = pathname ?? '/';
  return current === '/' || current === '/workflows' || current.startsWith('/workflows/') || current === '/skills' || current.startsWith('/skills/');
}

export function getCockpitNavItems(role: PublicUser['role'] | undefined, pathname: string | null | undefined): CockpitNavItem[] {
  const items: Array<Omit<CockpitNavItem, 'isActive'>> = [
    {
      id: 'workflows',
      label: 'Workflows',
      href: '/workflows',
      description: 'Launch focused AI workflows',
    },
    {
      id: 'chat',
      label: 'Chat',
      href: '/chats',
      description: 'Provider-routed workspace',
    },
    {
      id: 'runs',
      label: 'Runs',
      href: '/runs',
      description: 'Auditable workflow history',
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
      : item.id === 'workflows'
        ? isWorkflowRoute(pathname)
        : isActivePath(pathname, item.href),
  }));
}
