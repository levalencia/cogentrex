import type { ChannelClient, ChannelResult } from './channelClient.js';

function extractVideoId(input: string): string | null {
  const match = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] ?? null;
}

function extractCaptions(html: string): { url: string; language: string }[] | null {
  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*<\/script>/);
  if (!playerMatch || !playerMatch[1]) return null;
  try {
    const player = JSON.parse(playerMatch[1]);
    const tracks = player?.captions?.captionTracks;
    if (!Array.isArray(tracks)) return null;
    return tracks.map((t: { baseUrl: string; languageCode: string }) => ({ url: t.baseUrl, language: t.languageCode }));
  } catch {
    return null;
  }
}

function extractVideoInfo(html: string): { title: string; description: string } | null {
  const titleMatch = html.match(/<meta name="title" content="([^"]+)/);
  const descMatch = html.match(/<meta name="description" content="([^"]+)/);
  if (!titleMatch || !titleMatch[1]) return null;
  return { title: titleMatch[1], description: descMatch?.[1] ?? '' };
}

async function fetchTranscript(captionUrl: string): Promise<string> {
  const response = await fetch(captionUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) return '';
  const xml = await response.text();
  const texts = xml.match(/<text[^>]*>([^<]*)<\/text>/g);
  if (!texts) return '';
  return texts.map((t) => t.replace(/<text[^>]*>|<\/text>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join(' ');
}

export class YouTubeChannelClient implements ChannelClient {
  readonly name = 'youtube';

  async search(query: string, limit: number): Promise<ChannelResult[]> {
    const videoId = extractVideoId(query);
    if (!videoId) return [];
    try {
      const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!response.ok) return [];
      const html = await response.text();
      const info = extractVideoInfo(html);
      if (!info) return [];
      const captionTracks = extractCaptions(html);
      let transcript = '';
      if (captionTracks && captionTracks.length > 0) {
        const firstUrl = captionTracks[0]?.url;
        if (firstUrl) transcript = await fetchTranscript(firstUrl);
      }
      const markdown = `**Title:** ${info.title}\n**Description:** ${info.description.slice(0, 500)}\n\n**Transcript:**\n${transcript.slice(0, 5000)}`;
      return [{
        title: info.title,
        url: `https://youtube.com/watch?v=${videoId}`,
        markdown,
        description: info.description.slice(0, 240),
        channel: this.name,
      }];
    } catch {
      return [];
    }
  }
}
