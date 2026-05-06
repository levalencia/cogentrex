'use client';

import { useEffect } from 'react';
import { AuthPanel } from './AuthPanel';
import { ChatView } from './ChatView';
import { Sidebar } from './Sidebar';
import { useAppStore } from '@/store/appStore';

export function AppShell() {
  const user = useAppStore((state) => state.user);
  const isWarmingUp = useAppStore((state) => state.isWarmingUp);
  const bootstrap = useAppStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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
      <ChatView />
    </div>
  );
}
