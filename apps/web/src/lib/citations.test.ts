import { describe, expect, it } from 'vitest';
import { buildReferencedSources, extractCitationNumbers, linkCitationMarkers } from './citations';

const sources = [
  { id: 1, title: 'Official docs', url: 'https://example.com/docs' },
  { id: 2, title: 'Case study', url: 'https://example.com/case' },
];

describe('extractCitationNumbers', () => {
  it('returns unique citation numbers in first-seen order', () => {
    expect(extractCitationNumbers('Evidence [2], context [1], repeated [2].')).toEqual([2, 1]);
  });
});

describe('buildReferencedSources', () => {
  it('returns cited sources in first-cited order', () => {
    expect(buildReferencedSources('Evidence [2], context [1], repeated [2].', sources)).toEqual([
      sources[1],
      sources[0],
    ]);
  });

  it('falls back to all sources when the answer has no explicit citation markers', () => {
    expect(buildReferencedSources('Evidence without bracket citations.', sources)).toEqual(sources);
  });
});

describe('linkCitationMarkers', () => {
  it('converts known citation markers to local source links and leaves unknown markers untouched', () => {
    expect(linkCitationMarkers('Known [1], unknown [3].', sources)).toBe('Known [1](#source-1), unknown [3].');
  });
});
