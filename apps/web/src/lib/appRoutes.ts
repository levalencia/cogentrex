export type AppShellSurface = 'chat' | 'runs' | 'library';

export function getAppShellSurface(pathname: string | null | undefined, conversationId: string | undefined): AppShellSurface {
  const current = pathname ?? '/';
  if (current.startsWith('/runs')) return 'runs';
  if (current.startsWith('/library')) return 'library';
  if (conversationId || current === '/' || current === '/chats' || current.startsWith('/chats/')) return 'chat';
  return 'chat';
}
