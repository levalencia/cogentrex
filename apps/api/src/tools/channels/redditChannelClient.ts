import type { ChannelClient, ChannelResult } from './channelClient.js';

interface RedditPost {
  data: {
    title: string;
    url: string;
    selftext?: string;
    subreddit: string;
    author: string;
    num_comments: number;
    ups: number;
  };
}

interface RedditResponse {
  data?: {
    children?: RedditPost[];
  };
}

export class RedditChannelClient implements ChannelClient {
  readonly name = 'reddit';

  async search(query: string, limit: number): Promise<ChannelResult[]> {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Cogentrex/1.0' },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as RedditResponse;
    const posts = data.data?.children ?? [];
    return posts.map((post) => ({
      title: post.data.title,
      url: post.data.url,
      markdown: `**Subreddit:** r/${post.data.subreddit}\n**Author:** u/${post.data.author}\n**Upvotes:** ${post.data.ups}\n**Comments:** ${post.data.num_comments}\n\n${post.data.selftext ?? ''}`,
      description: post.data.selftext?.slice(0, 200),
      channel: this.name,
    }));
  }
}
