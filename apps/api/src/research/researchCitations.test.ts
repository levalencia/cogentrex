import { describe, expect, it } from 'vitest';
import type { ResearchSource } from '@cogentrex/shared';
import { auditCitations, ensureGroundedCitations } from './researchCitations.js';

const sources: ResearchSource[] = [
  { id: 1, title: 'Primary report', url: 'https://example.com/report', snippet: 'Evidence from the primary report.' },
  { id: 2, title: 'Expert analysis', url: 'https://example.com/analysis', snippet: 'Expert analysis of the issue.' },
];

describe('research citation grounding', () => {
  it('detects valid, invalid, and missing citation coverage', () => {
    expect(auditCitations('Claim [1], unsupported marker [9].', sources)).toMatchObject({
      citationCount: 2,
      validCitationCount: 1,
      invalidCitationCount: 1,
      missingCitations: false,
    });

    expect(auditCitations('Uncited answer.', sources)).toMatchObject({
      citationCount: 0,
      validCitationCount: 0,
      invalidCitationCount: 0,
      missingCitations: true,
    });
  });

  it('adds a cited sources note when the model returns an uncited answer despite available sources', () => {
    const result = ensureGroundedCitations('Uncited answer.', sources);

    expect(result.content).toContain('Uncited answer.');
    expect(result.content).toContain('Sources consulted:');
    expect(result.content).toContain('[1]');
    expect(result.content).toContain('[2]');
    expect(result.audit.fallbackApplied).toBe(true);
  });

  it('leaves already grounded answers unchanged', () => {
    const content = 'Grounded answer with support [2].';

    expect(ensureGroundedCitations(content, sources)).toEqual({
      content,
      audit: expect.objectContaining({
        validCitationCount: 1,
        fallbackApplied: false,
      }),
    });
  });
});
