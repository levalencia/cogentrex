'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';

interface MobileAppDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileAppDrawer({ open, onClose }: MobileAppDrawerProps) {
  const router = useRouter();
  const conversations = useAppStore((state) => state.conversations);
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const clearChat = useAppStore((state) => state.clearChat);

  if (!open) return null;

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Conversation history">
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close history" />
      <aside className="absolute inset-y-0 left-0 flex w-[86vw] max-w-sm flex-col border-r border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-accent">History</p>
            <p className="text-sm text-slate-400">Conversations and recent work</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-line px-3 py-1.5 text-sm text-slate-300">Close</button>
        </div>
        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              clearChat();
              navigate('/');
            }}
            className="w-full rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-white"
          >
            New chat
          </button>
        </div>
        <nav className="grid gap-1 px-3 pb-3 text-sm" aria-label="Mobile navigation">
          {[
            { label: 'Chat', href: '/chats' },
            { label: 'Runs', href: '/runs' },
            { label: 'Library', href: '/library' },
            { label: 'Admin', href: '/settings/admin/skills' },
          ].map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => navigate(item.href)}
              className="rounded-xl border border-line px-3 py-2 text-left text-slate-300 hover:border-accent hover:text-accent"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {conversations.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-600">No conversations yet</p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conversation) => {
                const isActive = activeConversationId === conversation.id;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => navigate(`/chats/${conversation.id}`)}
                    className={`w-full truncate rounded-xl px-3 py-2 text-left text-sm transition ${isActive ? 'bg-accent/15 text-accent' : 'text-slate-300 hover:bg-white/5'}`}
                  >
                    {conversation.title || 'Untitled'}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export function MobileSurfaceHeader({ title, subtitle, onOpenHistory }: { title: string; subtitle: string | undefined; onOpenHistory: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-panel/70 px-3 py-2 lg:hidden">
      <button
        type="button"
        onClick={onOpenHistory}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-lg text-slate-200"
        aria-label="Open conversation history"
      >
        ☰
      </button>
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-sm">
        <img src="/logo" alt="Cogentrex" className="h-5 w-5 object-contain" />
      </div>
      <div className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-[0.12em] text-accent">{title}</span>
        {subtitle ? <p className="truncate text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function MobileStandaloneShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string | undefined;
  children: ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <main className="min-h-screen bg-ink text-slate-100">
      <MobileAppDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <MobileSurfaceHeader title={title} subtitle={subtitle} onOpenHistory={() => setMobileMenuOpen(true)} />
      {children}
    </main>
  );
}
