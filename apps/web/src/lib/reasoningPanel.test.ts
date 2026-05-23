import { describe, expect, it } from 'vitest';
import { getReasoningPanelSummary } from './reasoningPanel.js';

describe('getReasoningPanelSummary', () => {
  it('labels active reasoning as thinking with the latest step', () => {
    expect(getReasoningPanelSummary({ isStreaming: true, latestStep: 'writing' })).toEqual({
      statusLabel: 'Thinking…',
      stepLabel: 'writing',
      isActive: true,
    });
  });

  it('labels completed reasoning as completed instead of thinking', () => {
    expect(getReasoningPanelSummary({ isStreaming: false, latestStep: 'writing' })).toEqual({
      statusLabel: 'Completed',
      stepLabel: 'writing',
      isActive: false,
    });
  });

  it('uses an empty step label when no latest step is available', () => {
    expect(getReasoningPanelSummary({ isStreaming: false })).toEqual({
      statusLabel: 'Completed',
      stepLabel: '',
      isActive: false,
    });
  });
});
