export type ResearchWorkspaceStatus = 'idle' | 'active' | 'done';

export interface ResearchWorkspaceInput {
  hasPendingPlan: boolean;
  isStreaming: boolean;
  reasoningCount: number;
  sourceCount: number;
  searchIterationCount: number;
}

export interface ResearchWorkspaceCard {
  id: 'plan' | 'search' | 'sources' | 'synthesis';
  label: string;
  metric: string;
  description: string;
  status: ResearchWorkspaceStatus;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildResearchWorkspaceCards(input: ResearchWorkspaceInput): ResearchWorkspaceCard[] {
  const planDone = input.searchIterationCount > 0 || input.sourceCount > 0 || input.reasoningCount > 0;
  const searchDone = input.sourceCount > 0;

  return [
    {
      id: 'plan',
      label: 'Plan',
      metric: input.hasPendingPlan ? 'Planning' : planDone ? 'Ready' : 'Queued',
      description: 'Turn the request into editable search intent before execution.',
      status: input.hasPendingPlan ? 'active' : planDone ? 'done' : 'idle',
    },
    {
      id: 'search',
      label: 'Search',
      metric: input.searchIterationCount > 0 ? pluralize(input.searchIterationCount, 'search', 'searches') : 'Not started',
      description: 'Track live channel searches and query expansion.',
      status: input.isStreaming && input.searchIterationCount > 0 ? 'active' : input.searchIterationCount > 0 ? 'done' : 'idle',
    },
    {
      id: 'sources',
      label: 'Sources',
      metric: input.sourceCount > 0 ? pluralize(input.sourceCount, 'source') : 'No sources yet',
      description: 'Keep evidence visible before the final answer lands.',
      status: searchDone ? 'done' : 'idle',
    },
    {
      id: 'synthesis',
      label: 'Synthesis',
      metric: input.reasoningCount > 0 ? pluralize(input.reasoningCount, 'event') : 'Waiting',
      description: 'Show reasoning events and final citation assembly.',
      status: input.isStreaming ? 'active' : input.reasoningCount > 0 ? 'done' : 'idle',
    },
  ];
}
