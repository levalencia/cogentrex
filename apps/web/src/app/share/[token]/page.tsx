import { api } from '@/lib/api';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import type { ChatMessage, ConversationSummary } from '@cogentrex/shared';
import Link from 'next/link';

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let conversation: ConversationSummary;
  let messages: ChatMessage[];
  try {
    const result = await api.getSharedConversation(token);
    conversation = result.conversation;
    messages = result.messages;
  } catch {
    return (
      <main className="flex h-screen items-center justify-center bg-ink text-slate-100">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white">Conversation not found</h1>
          <p className="mt-2 text-slate-400">This shared link may have expired or been revoked.</p>
          <Link href="/" className="mt-4 inline-block rounded-xl bg-accent px-4 py-2 font-semibold text-ink">
            Go to Cogentrex
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-slate-100">
      <header className="sticky top-0 z-10 border-b border-line bg-panel/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-sm">
              <img src="/logo" alt="Cogentrex" className="h-5 w-5 object-contain" />
            </div>
            <span className="text-sm font-semibold tracking-[0.12em] text-accent">Cogentrex</span>
          </div>
          <Link href="/" className="rounded-xl border border-line px-3 py-1.5 text-sm text-slate-300 hover:border-accent">
            Open Cogentrex
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">{conversation.title || 'Untitled conversation'}</h1>
          <p className="mt-1 text-sm text-slate-500">Shared conversation &middot; {new Date(conversation.createdAt).toLocaleDateString()}</p>
        </div>

        <div className="space-y-6">
          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] rounded-3xl px-5 py-4 leading-7 ${
                  message.role === 'user'
                    ? 'bg-accent text-ink whitespace-pre-wrap'
                    : 'border border-line bg-panel text-slate-100'
                }`}
              >
                {message.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                  <MarkdownMessage content={message.content} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
