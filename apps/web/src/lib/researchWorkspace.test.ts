import { describe, expect, it } from 'vitest';
import { buildResearchWorkspaceCards } from './researchWorkspace';

describe('buildResearchWorkspaceCards', () => {
  it('marks planning as active while the research plan is pending', () => {
    const cards = buildResearchWorkspaceCards({
      hasPendingPlan: true,
      isStreaming: false,
      reasoningCount: 0,
      sourceCount: 0,
      searchIterationCount: 0,
    });

    expect(cards.map((card) => card.status)).toEqual(['active', 'idle', 'idle', 'idle']);
    expect(cards[0]?.metric).toBe('Planning');
  });

  it('summarizes live research progress from iterations, sources, and reasoning', () => {
    const cards = buildResearchWorkspaceCards({
      hasPendingPlan: false,
      isStreaming: true,
      reasoningCount: 5,
      sourceCount: 8,
      searchIterationCount: 3,
    });

    expect(cards.map((card) => card.status)).toEqual(['done', 'active', 'done', 'active']);
    expect(cards[1]?.metric).toBe('3 searches');
    expect(cards[2]?.metric).toBe('8 sources');
    expect(cards[3]?.metric).toBe('5 events');
  });
});
