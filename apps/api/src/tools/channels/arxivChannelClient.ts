import type { ChannelClient, ChannelResult } from './channelClient.js';
import { decodeHtml, type FetchLike, normalizeLimit, stripCdata } from './channelUtils.js';

interface ArxivEntry {
  title: string;
  id: string;
  summary: string;
  published?: string;
  authors: string[];
}

function firstMatch(input: string, pattern: RegExp): string | undefined {
  return pattern.exec(input)?.[1]?.trim();
}

function parseEntries(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    if (!entryXml) continue;
    const title = firstMatch(entryXml, /<title>([\s\S]*?)<\/title>/i);
    const id = firstMatch(entryXml, /<id>([\s\S]*?)<\/id>/i);
    const summary = firstMatch(entryXml, /<summary>([\s\S]*?)<\/summary>/i);
    if (!title || !id || !summary) continue;
    const authors: string[] = [];
    const authorRegex = /<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
      const authorName = decodeHtml(stripCdata(authorMatch[1] ?? ''));
      if (authorName) authors.push(authorName);
    }
    const published = firstMatch(entryXml, /<published>([\s\S]*?)<\/published>/i);
    entries.push({
      title: decodeHtml(stripCdata(title)),
      id: id.trim(),
      summary: decodeHtml(stripCdata(summary)),
      ...(published ? { published } : {}),
      authors,
    });
  }
  return entries;
}

function normalizeArxivUrl(id: string): string {
  return id.replace('http://arxiv.org/abs/', 'https://arxiv.org/abs/');
}

export class ArxivChannelClient implements ChannelClient {
  readonly name = 'arxiv';

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async search(query: string, limit: number): Promise<ChannelResult[]> {
    const maxResults = normalizeLimit(limit, 10);
    const url = `https://export.arxiv.org/api/query?search_query=all%3A${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
    try {
      const response = await this.fetchImpl(url, { headers: { 'User-Agent': 'Cogentrex/1.0' } });
      if (!response.ok) return [];
      const xml = await response.text();
      return parseEntries(xml).slice(0, maxResults).map((entry) => ({
        title: entry.title,
        url: normalizeArxivUrl(entry.id),
        markdown: [
          `**Authors:** ${entry.authors.length ? entry.authors.join(', ') : 'Unknown'}`,
          `**Published:** ${entry.published ?? 'Unknown'}`,
          '',
          entry.summary,
        ].join('\n'),
        description: entry.summary.slice(0, 240),
        channel: this.name,
      }));
    } catch {
      return [];
    }
  }
}
