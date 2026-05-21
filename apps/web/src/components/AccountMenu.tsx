'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { getUserDisplayEmail, getUserInitials } from '@/lib/userDisplay';

interface MenuLinkItem {
  label: string;
  href: string;
  helper?: string;
}

interface MenuDisabledItem {
  label: string;
  disabled: true;
  helper?: string;
}

type MenuItem = MenuLinkItem | MenuDisabledItem;

const menuItems: MenuItem[] = [
  { label: 'Profile', disabled: true, helper: 'Coming soon' },
  { label: 'Provider & model settings', href: '/settings/providers' },
  { label: 'Social accounts', href: '/settings/social' },
  { label: 'Workspace preferences', disabled: true, helper: 'Coming soon' },
];

function isDisabledItem(item: MenuItem): item is MenuDisabledItem {
  return 'disabled' in item && item.disabled;
}

export function AccountMenu() {
  const user = useAppStore((state) => state.user);
  const logout = useAppStore((state) => state.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const initials = getUserInitials(user);
  const email = getUserDisplayEmail(user);

  return (
    <div ref={ref} className="relative border-b border-line p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-white/5"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-sm font-black text-ink shadow-sm">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">Cogentrex</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">{email}</span>
        </span>
        <svg className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div role="menu" className="absolute left-3 right-3 top-[calc(100%-0.5rem)] z-50 rounded-2xl border border-line bg-panel p-2 shadow-2xl shadow-black/50">
          <div className="mb-1 border-b border-line pb-2">
            <p className="px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-600">Account</p>
            {menuItems.map((item) => (
              isDisabledItem(item) ? (
                <div
                  key={item.label}
                  role="menuitem"
                  aria-disabled="true"
                  className="rounded-xl px-3 py-2 text-sm text-slate-600"
                >
                  <span className="block">{item.label}</span>
                  {item.helper ? <span className="mt-0.5 block text-[11px] text-slate-700">{item.helper}</span> : null}
                </div>
              ) : (
                <a
                  key={item.label}
                  role="menuitem"
                  href={item.href}
                  className="block rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </a>
              )
            ))}
          </div>

          {user?.role === 'ADMIN' ? (
            <div className="mb-1 border-b border-line pb-2">
              <p className="px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-600">Admin</p>
              <a
                role="menuitem"
                href="/settings/admin/providers"
                className="block rounded-xl px-3 py-2 text-sm text-accent hover:bg-accent/10"
              >
                Admin provider settings
              </a>
            </div>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
          >
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
