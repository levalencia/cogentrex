import type { CapabilityReadinessItem, CapabilityStatus, WorkflowReadiness } from '@cogentrex/shared';

interface ReadinessTone {
  label: string;
  className: string;
}

const toneByStatus: Record<CapabilityStatus, ReadinessTone> = {
  ready: {
    label: 'Ready',
    className: 'border-green-500/30 bg-green-500/10 text-green-200',
  },
  degraded: {
    label: 'Degraded',
    className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200',
  },
  missing: {
    label: 'Missing',
    className: 'border-red-500/30 bg-red-500/10 text-red-200',
  },
};

export function getReadinessTone(status: CapabilityStatus): ReadinessTone {
  return toneByStatus[status];
}

interface CapabilityAction {
  href: string;
  label: string;
}

export function getCapabilityAction(item: CapabilityReadinessItem): CapabilityAction | null {
  if (item.status === 'ready') return null;
  return String(item.id).startsWith('web.')
    ? { href: '/settings/admin/skills', label: 'Review skill routing' }
    : { href: '/settings/admin/providers', label: 'Configure provider' };
}

export function getCapabilitySummary(readiness: WorkflowReadiness): string {
  const items = [...readiness.providers, ...readiness.tools];
  const actionableMessages = items
    .filter((item) => item.status !== 'ready' && item.message)
    .sort((a, b) => statusPriority(a.status) - statusPriority(b.status))
    .map((item) => item.message as string);

  if (actionableMessages.length > 0) {
    return actionableMessages.join(' ');
  }

  const adapterIds = items
    .map((item) => item.adapterId)
    .filter((adapterId): adapterId is string => Boolean(adapterId));

  if (adapterIds.length > 0) {
    return `Ready with ${formatList(adapterIds)}.`;
  }

  return readiness.status === 'ready'
    ? 'All required capabilities are configured.'
    : 'Some required capabilities need configuration.';
}

function statusPriority(status: CapabilityStatus): number {
  switch (status) {
    case 'missing':
      return 0;
    case 'degraded':
      return 1;
    case 'ready':
      return 2;
  }
}

export function formatCapabilityId(id: string): string {
  const labels: Record<string, string> = {
    text: 'Text model',
    streaming: 'Streaming',
    vision: 'Vision',
    'tool-calling': 'Tool calling',
    'provider-search': 'Provider search',
    image: 'Image generation',
    video: 'Video generation',
    'web.search': 'Web search',
    'web.fetch': 'URL fetch',
    'web.extract': 'URL extraction',
  };
  return labels[id] ?? id;
}

function formatList(values: string[]): string {
  if (values.length === 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}
