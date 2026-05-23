export interface ReasoningPanelSummaryInput {
  isStreaming: boolean;
  latestStep?: string | undefined;
}

export interface ReasoningPanelSummary {
  statusLabel: 'Thinking…' | 'Completed';
  stepLabel: string;
  isActive: boolean;
}

export function getReasoningPanelSummary(input: ReasoningPanelSummaryInput): ReasoningPanelSummary {
  return {
    statusLabel: input.isStreaming ? 'Thinking…' : 'Completed',
    stepLabel: input.latestStep ?? '',
    isActive: input.isStreaming,
  };
}
