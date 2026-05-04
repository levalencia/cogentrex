'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/appStore';

export function AuthPanel() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const login = useAppStore((state) => state.login);
  const register = useAppStore((state) => state.register);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17233a,#0b0f19_46%)] px-6 py-10 text-slate-100">
      <section className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="mb-4 text-sm uppercase tracking-[0.32em] text-accent">Cogentrex</p>
          <h1 className="text-5xl font-semibold tracking-tight text-white md:text-7xl">Your private deep research cockpit.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Multi-provider chat, Microsoft Foundry Kimi 2.6 by default, visible reasoning, citations, and a research loop designed for serious work.
          </p>
        </div>
        <form onSubmit={submit} className="rounded-3xl border border-line bg-panel/80 p-6 shadow-2xl shadow-black/30 backdrop-blur">
          <h2 className="text-2xl font-semibold">{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
          <p className="mt-2 text-sm text-slate-400">Email/password auth only. OAuth can be added later.</p>
          <label className="mt-6 block text-sm text-slate-300">
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="mt-2 w-full rounded-2xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent" />
          </label>
          <label className="mt-4 block text-sm text-slate-300">
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={10} required className="mt-2 w-full rounded-2xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent" />
          </label>
          {error ? <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
          <button className="mt-6 w-full rounded-2xl bg-accent px-4 py-3 font-semibold text-ink transition hover:bg-blue-300" type="submit">
            {mode === 'login' ? 'Sign in' : 'Register'}
          </button>
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="mt-4 w-full text-sm text-slate-300 hover:text-white">
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
