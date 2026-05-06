import type { DbAdapter } from '../db/adapter.js';

interface SocialConfigRow {
  id: number;
  user_id: string;
  platform: string;
  system_prompt: string;
  is_enabled: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface SocialConfigRecord {
  id: number;
  userId: string;
  platform: string;
  systemPrompt: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: SocialConfigRow): SocialConfigRecord {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    systemPrompt: row.system_prompt,
    isEnabled: row.is_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DEFAULT_PROMPTS: Record<string, string> = {
  linkedin: `You are an expert LinkedIn content strategist. Write posts that:
- Start with a strong hook in the first line
- Use short paragraphs (1-3 sentences each) for readability
- Include a reflective question or call-to-action at the end
- Maintain a professional yet approachable tone
- Avoid hashtags unless specifically relevant
- Keep total length between 150-300 words`,
  x: `You are an expert X (Twitter) content creator. Write posts that:
- Are punchy, opinionated, and memorable
- Stay under 280 characters (or create a thread if needed)
- Use 1-2 relevant hashtags naturally
- Include a clear hook or controversial take
- Feel conversational and authentic`,
  medium: `You are an expert Medium writer. Draft articles that:
- Start with a compelling headline idea and subtitle
- Use clear section headers (H2/H3)
- Include practical examples and actionable takeaways
- Write 800-1,500 words in a thoughtful, authoritative tone
- End with a strong conclusion and call-to-action`,
  reddit: `You are a savvy Reddit contributor. Write posts that:
- Feel casual and conversational
- Ask thought-provoking questions to spark discussion
- Are short (2-4 sentences) and to the point
- Avoid marketing language or sales pitches
- Match the authentic community tone`,
  substack: `You are a warm, engaging Substack writer. Draft newsletter notes that:
- Feel personal and conversational, like writing to a friend
- Share insights with a clear lesson or takeaway
- Use 2-4 short paragraphs
- Include a friendly sign-off or question to readers`,
};

export class SocialConfigRepository {
  constructor(private readonly db: DbAdapter) {}

  async listForUser(userId: string): Promise<SocialConfigRecord[]>{
    const rows = await this.db.prepare(
      'SELECT * FROM social_configs WHERE user_id = ? ORDER BY platform ASC',
    ).all(userId) as SocialConfigRow[];

    if (rows.length === 0) {
      // Seed defaults for new users
      const now = new Date().toISOString();
      const insert = this.db.prepare(
        'INSERT INTO social_configs (user_id, platform, system_prompt, is_enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
      );
      for (const [platform, prompt] of Object.entries(DEFAULT_PROMPTS)) {
        await insert.run(userId, platform, prompt, now, now);
      }
      return this.listForUser(userId);
    }

    return rows.map(mapRow);
  }

  async findForUser(userId: string, platform: string): Promise<SocialConfigRecord | null>{
    const row = await this.db.prepare(
      'SELECT * FROM social_configs WHERE user_id = ? AND platform = ?',
    ).get(userId, platform) as SocialConfigRow | undefined;
    return row ? mapRow(row) : null;
  }

  async upsert(userId: string, platform: string, systemPrompt: string, isEnabled: boolean): Promise<void>{
    const now = new Date().toISOString();
    const existing = await this.findForUser(userId, platform);
    if (existing) {
      await this.db.prepare(
        'UPDATE social_configs SET system_prompt = ?, is_enabled = ?, updated_at = ? WHERE user_id = ? AND platform = ?',
      ).run(systemPrompt, isEnabled ? 1 : 0, now, userId, platform);
    } else {
      await this.db.prepare(
        'INSERT INTO social_configs (user_id, platform, system_prompt, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(userId, platform, systemPrompt, isEnabled ? 1 : 0, now, now);
    }
  }
}
