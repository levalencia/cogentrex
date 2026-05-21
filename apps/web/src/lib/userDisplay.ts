import type { PublicUser } from '@cogentrex/shared';

type UserEmail = Pick<PublicUser, 'email'>;

export function getUserInitials(user: UserEmail | null | undefined): string {
  const email = user?.email.trim();
  if (!email) return '??';

  const localPart = email.split('@')[0] ?? email;
  const parts = localPart.split(/[._\-\s]+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
  }

  return localPart.slice(0, 2).toUpperCase();
}

export function getUserDisplayEmail(user: UserEmail | null | undefined): string {
  return user?.email ?? 'Signed in';
}
