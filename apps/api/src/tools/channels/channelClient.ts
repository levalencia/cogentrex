export interface ChannelResult {
  title: string;
  url: string;
  markdown: string;
  description?: string | undefined;
  channel: string;
}

export interface ChannelClient {
  readonly name: string;
  search(query: string, limit: number): Promise<ChannelResult[]>;
}
