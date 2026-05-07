import type { ResearchSource } from '@cogentrex/shared';
import type { ModelMessage } from '../chat/languageModel.js';

export function createPlanningMessages(question: string, seedContext?: string): ModelMessage[] {
  const systemContent = seedContext
    ? `You are a deep research planner. The user included source URLs. Use the extracted context below as primary evidence when creating search queries. Return only JSON: {"queries":["..."]}. Generate up to 10 focused search queries that together answer the user question. No markdown.\n\nAvailable channels: web, reddit, youtube, rss. Prefix queries with channel name followed by colon (e.g., "reddit:latest discussions"). Default to "web:" if no prefix is needed.\n\nExtracted context:\n${seedContext}`
    : 'You are a deep research planner. Return only JSON: {"queries":["..."]}. Generate up to 10 focused search queries that together answer the user question. No markdown.\n\nAvailable channels: web, reddit, youtube, rss. Prefix queries with channel name followed by colon (e.g., "reddit:latest discussions"). Default to "web:" if no prefix is needed.';
  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: question },
  ];
}

export function createFollowUpPlanningMessages(question: string, priorSourceCount: number, priorTopics: string, seedContext?: string): ModelMessage[] {
  const systemContent = seedContext
    ? `You are a deep research planner for FOLLOW-UP questions. Prior research already found ${priorSourceCount} sources covering: ${priorTopics}.\n\nGenerate up to 5 NEW search queries focused on information NOT already covered by prior research. Avoid re-searching the same topics. Return only JSON: {"queries":["..."]}.\n\nAvailable channels: web, reddit, youtube, rss. Prefix queries with channel name followed by colon.\n\nExtracted context:\n${seedContext}`
    : `You are a deep research planner for FOLLOW-UP questions. Prior research already found ${priorSourceCount} sources covering: ${priorTopics}.\n\nGenerate up to 5 NEW search queries focused on information NOT already covered by prior research. Avoid re-searching the same topics. Return only JSON: {"queries":["..."]}.\n\nAvailable channels: web, reddit, youtube, rss. Prefix queries with channel name followed by colon.`;
  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: question },
  ];
}

export function createSynthesisMessages(question: string, sourceNotes: string): ModelMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a rigorous research assistant. Produce a detailed answer with inline numeric citations like [1]. Only cite sources present in the provided source notes. Be explicit about uncertainty and conflicting evidence.',
    },
    {
      role: 'user',
      content: `Question:\n${question}\n\nSource notes:\n${sourceNotes}`,
    },
  ];
}

export function formatSourcesForPrompt(sources: ResearchSource[], excerpts: Map<number, string>): string {
  return sources
    .map((source) => `[${source.id}] ${source.title}\nURL: ${source.url}\nExcerpt:\n${excerpts.get(source.id) ?? source.snippet ?? ''}`)
    .join('\n\n');
}
