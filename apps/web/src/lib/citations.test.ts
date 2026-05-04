import { describe, expect, it } from 'vitest';
import { extractCitationNumbers } from './citations';

describe('extractCitationNumbers', () => {
  it('returns unique citation numbers in first-seen order', () => {
    expect(extractCitationNumbers('Evidence [2], context [1], repeated [2].')).toEqual([2, 1]);
  });
});
