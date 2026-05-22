import type { WorkflowReadiness } from '@cogentrex/shared';
import { getCapabilitySummary, getReadinessTone } from './capabilities';
import { describe, expect, it } from 'vitest';

function workflow(overrides: Partial<WorkflowReadiness> = {}): WorkflowReadiness {
  return {
    workflow: {
      id: 'DEEP_RESEARCH',
      label: 'Deep Research',
      description: 'Plan, search, collect sources, and synthesize cited answers.',
      requiredProviderCapabilities: ['text'],
      optionalProviderCapabilities: ['streaming'],
      requiredToolCapabilities: ['web.search'],
      optionalToolCapabilities: ['web.fetch'],
    },
    status: 'ready',
    providers: [
      { id: 'text', status: 'ready', message: 'Satisfied by Kimi.' },
      { id: 'streaming', status: 'ready', message: 'Satisfied by Kimi.' },
    ],
    tools: [
      { id: 'web.search', status: 'ready', adapterId: 'brave.search' },
      { id: 'web.fetch', status: 'ready', adapterId: 'scrapling.fetch' },
    ],
    ...overrides,
  };
}

describe('capability readiness helpers', () => {
  it('summarizes ready workflows with active adapter ids', () => {
    expect(getCapabilitySummary(workflow())).toBe('Ready with brave.search and scrapling.fetch.');
  });

  it('surfaces missing and degraded capability messages before generic adapter copy', () => {
    const item = workflow({
      status: 'degraded',
      tools: [
        { id: 'web.search', status: 'degraded', adapterId: 'fake.search', message: 'Synthetic search is available for local/test use only.' },
        { id: 'web.fetch', status: 'missing', message: 'Configure SCRAPLING_BASE_URL to enable URL fetching.' },
      ],
    });

    expect(getCapabilitySummary(item)).toBe('Configure SCRAPLING_BASE_URL to enable URL fetching. Synthetic search is available for local/test use only.');
  });

  it('maps statuses to explicit UI tones', () => {
    expect(getReadinessTone('ready').label).toBe('Ready');
    expect(getReadinessTone('degraded').label).toBe('Degraded');
    expect(getReadinessTone('missing').label).toBe('Missing');
  });
});
