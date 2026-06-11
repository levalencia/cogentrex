export type AppShellSurface = 'chat' | 'start' | 'runs' | 'library' | 'skillDetail';

export function getAppShellSurface(pathname: string | null | undefined, conversationId: string | undefined): AppShellSurface {
  const current = pathname ?? '/';
  if (current.startsWith('/runs')) return 'runs';
  if (current.startsWith('/library')) return 'library';
  if (current.startsWith('/workflows/') || current.startsWith('/skills/')) return 'skillDetail';
  if (current === '/workflows' || current === '/skills') return 'start';
  if (conversationId || current === '/' || current === '/chats' || current.startsWith('/chats/')) return 'chat';
  return 'chat';
}
