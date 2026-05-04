import type { ChannelClient, ChannelResult } from './channelClient.js';

interface RssItem {
  title?: string | undefined;
  link?: string | undefined;
  description?: string | undefined;
  content?: string | undefined;
  pubDate?: string | undefined;
}

function looksLikeFeedUrl(query: string): boolean {
  return /\.(rss|xml|atom|feed)$/i.test(query) || /\/feed\b|\/rss\b/i.test(query);
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
  const linkRegex = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i;
  const descRegex = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i;
  const contentRegex = /<(content:encoded)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/\1>/i;
  const dateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/i;

  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
    const itemXml = match[1];
    if (!itemXml) continue;
    const title = titleRegex.exec(itemXml)?.[1]?.trim();
    const link = linkRegex.exec(itemXml)?.[1]?.trim();
    const description = descRegex.exec(itemXml)?.[1]?.trim();
    const content = contentRegex.exec(itemXml)?.[2]?.trim();
    const pubDate = dateRegex.exec(itemXml)?.[1]?.trim();
    if (title && link) {
      items.push({ title, link, description, content, pubDate });
    }
  }

  return items;
}

export class RssChannelClient implements ChannelClient {
  readonly name = 'rss';

  async search(query: string, limit: number): Promise<ChannelResult[]> {
    const feedUrl = looksLikeFeedUrl(query) ? query : `${query} RSS feed`;
    if (!looksLikeFeedUrl(feedUrl)) {
      return [];
    }
    try {
      const response = await fetch(feedUrl, {
        headers: { 'User-Agent': 'Cogentrex/1.0' },
        redirect: 'follow',
      });
      if (!response.ok) return [];
      const xml = await response.text();
      const items = parseRssItems(xml);
      return items.slice(0, limit).map((item) => ({
        title: item.title ?? 'Untitled',
        url: item.link ?? feedUrl,
        markdown: `**Published:** ${item.pubDate ?? 'Unknown'}\n\n${item.content ?? item.description ?? ''}`,
        description: item.description?.slice(0, 240),
        channel: this.name,
      }));
    } catch {
      return [];
    }
  }
}
