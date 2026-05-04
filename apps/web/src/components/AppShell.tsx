'use client';

import { useEffect } from 'react';
import { AuthPanel } from './AuthPanel';
import { ChatView } from './ChatView';
import { Sidebar } from './Sidebar';
import { useAppStore } from '@/store/appStore';

export function AppShell() {
  const user = useAppStore((state) => state.user);
  const bootstrap = useAppStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!user) return <AuthPanel />;

  return (
    <div className="flex h-screen overflow-hidden bg-ink text-slate-100">
      <Sidebar />
      <ChatView />
    </div>
  );
}
