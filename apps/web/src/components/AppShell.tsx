'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { AuthPanel } from './AuthPanel';
import { ChatView } from './ChatView';
import { LibraryView } from './LibraryView';
import { RunsView } from './RunsView';
import { Sidebar } from './Sidebar';
import { MobileAppDrawer, MobileSurfaceHeader } from './MobileAppMenu';
import { getAppShellSurface } from '@/lib/appRoutes';
import { useAppStore } from '@/store/appStore';

export function AppShell() {
  const user = useAppStore((state) => state.user);
  const isWarmingUp = useAppStore((state) => state.isWarmingUp);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const loadMessages = useAppStore((state) => state.loadMessages);
  const clearChat = useAppStore((state) => state.clearChat);
  const params = useParams();
  const pathname = usePathname();
  const conversationId = params?.id as string | undefined;
  const surface = getAppShellSurface(pathname, conversationId);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const openMobileMenu = () => setMobileMenuOpen(true);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (conversationId) {
      void loadMessages(conversationId);
    } else if (pathname === '/' || pathname === '/chats') {
      clearChat();
    }
  }, [conversationId, pathname, loadMessages, clearChat]);

  if (user === undefined) {
    return (
      <main className="flex h-screen items-center justify-center bg-ink text-slate-100">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="mt-4 text-sm text-slate-400">
            {isWarmingUp ? 'API is warming up… Please wait.' : 'Loading Cogentrex…'}
          </p>
        </div>
      </main>
    );
  }

  if (!user) return <AuthPanel />;

  const currentSurfaceLabel = surface === 'runs' ? 'Runs' : surface === 'library' ? 'Library' : 'Cogentrex';
  const currentSurfaceSubtitle = surface === 'runs'
    ? 'Auditable task history'
    : surface === 'library'
    ? 'Reusable saved outputs'
    : undefined;

  return (
    <div className="flex h-screen overflow-hidden bg-ink text-slate-100">
      <Sidebar />
      <MobileAppDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      {surface === 'runs' ? (
        <div className="flex h-full flex-1 flex-col overflow-hidden">
          <MobileSurfaceHeader title={currentSurfaceLabel} subtitle={currentSurfaceSubtitle} onOpenHistory={openMobileMenu} />
          <RunsView />
        </div>
      ) : surface === 'library' ? (
        <div className="flex h-full flex-1 flex-col overflow-hidden">
          <MobileSurfaceHeader title={currentSurfaceLabel} subtitle={currentSurfaceSubtitle} onOpenHistory={openMobileMenu} />
          <LibraryView />
        </div>
      ) : (
        <ChatView onOpenHistory={openMobileMenu} />
      )}
    </div>
  );
}
