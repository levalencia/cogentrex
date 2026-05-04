import type { ProviderRuntimeConfig } from '../providers/providerService.js';
import type { LanguageModelClient } from '../chat/languageModel.js';
import { createPlanningMessages } from './researchPrompts.js';

export interface PlanItem {
  query: string;
  channel: string;
}

export function parsePlanItem(raw: string): PlanItem {
  const match = raw.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
  if (match && match[1] && match[2]) {
    return { channel: match[1].toLowerCase(), query: match[2] };
  }
  return { channel: 'web', query: raw };
}

export class ResearchPlanner {
  constructor(private readonly llm: LanguageModelClient) {}

  async plan(provider: ProviderRuntimeConfig, question: string, seedContext?: string): Promise<PlanItem[]> {
    try {
      const text = await this.llm.complete(provider, createPlanningMessages(question, seedContext));
      const parsed = JSON.parse(text) as { queries?: unknown };
      if (Array.isArray(parsed.queries)) {
        const items = parsed.queries
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map(parsePlanItem);
        if (items.length) return items.slice(0, 10);
      }
    } catch {
      // Fallback keeps research available even when the planning response is not valid JSON.
    }
    return [
      { query: question, channel: 'web' },
      { query: `${question} recent evidence`, channel: 'web' },
      { query: `${question} expert analysis`, channel: 'web' },
      { query: `${question} limitations criticism`, channel: 'web' },
    ];
  }
}
