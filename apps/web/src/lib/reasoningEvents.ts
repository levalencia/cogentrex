export interface DisplayReasoningEntry {
  step: string;
  detail?: string | undefined;
  iteration?: number | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function toDisplayReasoningEntries(value: unknown): DisplayReasoningEntry[] {
  if (!Array.isArray(value)) return [];

  const entries: DisplayReasoningEntry[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if ('type' in item && item.type !== 'reasoning') continue;
    if (typeof item.step !== 'string' || !item.step.trim()) continue;

    const entry: DisplayReasoningEntry = { step: item.step };
    if (typeof item.detail === 'string') entry.detail = item.detail;
    if (typeof item.iteration === 'number') entry.iteration = item.iteration;
    entries.push(entry);
  }
  return entries;
}
