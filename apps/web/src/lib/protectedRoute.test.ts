import { describe, expect, it } from 'vitest';
import type { PublicUser } from '@cogentrex/shared';
import { getProtectedRouteState } from './protectedRoute';

const adminUser: PublicUser = {
  id: 'usr_admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const regularUser: PublicUser = {
  id: 'usr_user',
  email: 'user@example.com',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('getProtectedRouteState', () => {
  it('keeps protected pages loading until bootstrap resolves the session', () => {
    expect(getProtectedRouteState(undefined, { requireAdmin: false })).toEqual({ status: 'loading' });
  });

  it('redirects unauthenticated users to login for protected pages', () => {
    expect(getProtectedRouteState(null, { requireAdmin: false })).toEqual({ status: 'redirect', href: '/' });
  });

  it('redirects unauthenticated users to login before calling admin-only APIs', () => {
    expect(getProtectedRouteState(null, { requireAdmin: true })).toEqual({ status: 'redirect', href: '/' });
  });

  it('blocks signed-in non-admin users from admin-only pages', () => {
    expect(getProtectedRouteState(regularUser, { requireAdmin: true })).toEqual({ status: 'forbidden' });
  });

  it('allows admins into admin-only pages', () => {
    expect(getProtectedRouteState(adminUser, { requireAdmin: true })).toEqual({ status: 'authorized' });
  });
});
