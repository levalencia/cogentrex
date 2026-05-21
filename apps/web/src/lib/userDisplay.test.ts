import { describe, expect, it } from 'vitest';
import { getUserDisplayEmail, getUserInitials } from './userDisplay';

describe('userDisplay', () => {
  describe('getUserInitials', () => {
    it('uses the first two letters for a single-part email local name', () => {
      expect(getUserInitials({ email: 'luis@example.com' })).toBe('LU');
    });

    it('uses first letters from dot-separated email local names', () => {
      expect(getUserInitials({ email: 'luis.valencia@example.com' })).toBe('LV');
    });

    it('uses first letters from hyphen-separated email local names', () => {
      expect(getUserInitials({ email: 'luis-valencia@example.com' })).toBe('LV');
    });

    it('falls back when user is missing', () => {
      expect(getUserInitials(undefined)).toBe('??');
    });
  });

  describe('getUserDisplayEmail', () => {
    it('returns the signed-in user email', () => {
      expect(getUserDisplayEmail({ email: 'luis@example.com' })).toBe('luis@example.com');
    });

    it('returns a neutral label when user is missing', () => {
      expect(getUserDisplayEmail(null)).toBe('Signed in');
    });
  });
});
