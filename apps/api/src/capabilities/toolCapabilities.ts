import type { CapabilityReadinessItem, ToolCapabilityId } from '@cogentrex/shared';
import type { AppEnv } from '../config/env.js';

export function resolveToolCapability(env: AppEnv, capability: ToolCapabilityId): CapabilityReadinessItem {
  switch (capability) {
    case 'web.search':
      return resolveWebSearch(env);
    case 'web.fetch':
      return resolveWebFetch(env, 'web.fetch');
    case 'web.extract':
      return resolveWebFetch(env, 'web.extract');
    default:
      return { id: capability, status: 'missing', message: 'Unknown tool capability.' };
  }
}

function resolveWebSearch(env: AppEnv): CapabilityReadinessItem {
  const adapter = env.WEB_SEARCH_ADAPTER;
  if ((adapter === undefined || adapter === 'brave') && env.BRAVE_SEARCH_API_KEY) {
    return { id: 'web.search', status: 'ready', adapterId: 'brave.search' };
  }
  if ((adapter === undefined || adapter === 'firecrawl') && env.FIRECRAWL_API_KEY) {
    return {
      id: 'web.search',
      status: 'degraded',
      adapterId: 'firecrawl.search',
      message: 'Firecrawl is configured as a fallback search adapter. Brave is the preferred default.',
    };
  }
  if (adapter === 'fake' || env.NODE_ENV !== 'production') {
    return {
      id: 'web.search',
      status: 'degraded',
      adapterId: 'fake.search',
      message: 'Synthetic search is available for local/test use only.',
    };
  }
  return {
    id: 'web.search',
    status: 'missing',
    message: 'Configure BRAVE_SEARCH_API_KEY to enable web search.',
  };
}

function resolveWebFetch(env: AppEnv, id: 'web.fetch' | 'web.extract'): CapabilityReadinessItem {
  const adapter = env.WEB_FETCH_ADAPTER;
  if ((adapter === undefined || adapter === 'scrapling') && env.SCRAPLING_BASE_URL) {
    return { id, status: 'ready', adapterId: id === 'web.fetch' ? 'scrapling.fetch' : 'scrapling.extract' };
  }
  if ((adapter === undefined || adapter === 'firecrawl') && env.FIRECRAWL_API_KEY) {
    return {
      id,
      status: 'degraded',
      adapterId: id === 'web.fetch' ? 'firecrawl.fetch' : 'firecrawl.extract',
      message: 'Firecrawl is configured as a fallback fetch adapter. Scrapling is the preferred default.',
    };
  }
  if (adapter === 'simple') {
    return {
      id,
      status: 'degraded',
      adapterId: 'simple.fetch',
      message: 'Simple fetch is available but may miss rendered or protected pages.',
    };
  }
  if (adapter === 'fake' || env.NODE_ENV !== 'production') {
    return {
      id,
      status: 'degraded',
      adapterId: 'fake.fetch',
      message: 'Synthetic fetch is available for local/test use only.',
    };
  }
  return {
    id,
    status: 'missing',
    message: 'Configure SCRAPLING_BASE_URL to enable URL fetching.',
  };
}
