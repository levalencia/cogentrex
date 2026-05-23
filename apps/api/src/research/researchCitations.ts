import type { ResearchSource } from '@cogentrex/shared';

export interface CitationAudit {
  citationCount: number;
  validCitationCount: number;
  invalidCitationCount: number;
  missingCitations: boolean;
  fallbackApplied: boolean;
}

function citationIds(content: string): number[] {
  const ids: number[] = [];
  const regex = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const id = Number(match[1]);
    if (Number.isInteger(id)) ids.push(id);
  }
  return ids;
}

export function auditCitations(content: string, sources: ResearchSource[]): CitationAudit {
  const citedIds = citationIds(content);
  const sourceIds = new Set(sources.map((source) => source.id));
  const validCitationCount = citedIds.filter((id) => sourceIds.has(id)).length;
  const invalidCitationCount = citedIds.length - validCitationCount;

  return {
    citationCount: citedIds.length,
    validCitationCount,
    invalidCitationCount,
    missingCitations: sources.length > 0 && validCitationCount === 0,
    fallbackApplied: false,
  };
}

export function ensureGroundedCitations(content: string, sources: ResearchSource[]): { content: string; audit: CitationAudit } {
  const audit = auditCitations(content, sources);
  if (!audit.missingCitations) return { content, audit };

  const consulted = sources
    .slice(0, 3)
    .map((source) => `[${source.id}] ${source.title}`)
    .join('; ');
  const separator = content.trim().length ? '\n\n' : '';

  return {
    content: `${content}${separator}Sources consulted: ${consulted}.`,
    audit: { ...audit, fallbackApplied: true },
  };
}
