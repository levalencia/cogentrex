'use client';

import { useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { AuthPanel } from './AuthPanel';
import { ChatView } from './ChatView';
import { LibraryView } from './LibraryView';
import { RunsView } from './RunsView';
import { Sidebar } from './Sidebar';
import { SkillCockpitView } from './SkillCockpitView';
import { SkillDetailView } from './SkillDetailView';
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
  const isLibraryRoute = pathname?.startsWith('/library') ?? false;
  const isRunsRoute = pathname?.startsWith('/runs') ?? false;
  const isSkillDetailRoute = pathname?.startsWith('/skills/') ?? false;
  const isSkillsRoute = pathname === '/' || pathname === '/skills';

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

  return (
    <div className="flex h-screen overflow-hidden bg-ink text-slate-100">
      <Sidebar />
      {isRunsRoute ? <RunsView /> : isLibraryRoute ? <LibraryView /> : isSkillDetailRoute ? <SkillDetailView /> : isSkillsRoute ? <SkillCockpitView /> : <ChatView />}
    </div>
  );
}
