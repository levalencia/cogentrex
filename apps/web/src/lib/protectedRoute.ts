import type { PublicUser } from '@cogentrex/shared';

export type ProtectedRouteState =
  | { status: 'loading' }
  | { status: 'redirect'; href: string }
  | { status: 'forbidden' }
  | { status: 'authorized' };

interface ProtectedRouteOptions {
  requireAdmin: boolean;
}

export function getProtectedRouteState(user: PublicUser | null | undefined, options: ProtectedRouteOptions): ProtectedRouteState {
  if (user === undefined) return { status: 'loading' };
  if (!user) return { status: 'redirect', href: '/' };
  if (options.requireAdmin && user.role !== 'ADMIN') return { status: 'forbidden' };
  return { status: 'authorized' };
}
