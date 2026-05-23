import type { ResearchSource } from '@cogentrex/shared';

export function extractCitationNumbers(content: string): number[] {
  return Array.from(content.matchAll(/\[(\d+)]/g), (match) => Number(match[1]))
    .filter((value, index, values) => Number.isInteger(value) && values.indexOf(value) === index);
}

export function buildReferencedSources(content: string, sources: ResearchSource[] | undefined): ResearchSource[] {
  if (!sources?.length) return [];
  const citationNumbers = extractCitationNumbers(content);
  if (!citationNumbers.length) return sources;

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return citationNumbers
    .map((id) => sourceById.get(id))
    .filter((source): source is ResearchSource => Boolean(source));
}

export function linkCitationMarkers(content: string, sources: ResearchSource[] | undefined): string {
  if (!sources?.length) return content;
  const sourceIds = new Set(sources.map((source) => source.id));
  return content.replace(/\[(\d+)]/g, (match, rawId) => {
    const id = Number(rawId);
    return sourceIds.has(id) ? `[${id}](#source-${id})` : match;
  });
}
