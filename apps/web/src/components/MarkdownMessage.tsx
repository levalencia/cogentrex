'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
import { useState, useRef, useEffect } from 'react';
import type { ResearchSource } from '@cogentrex/shared';

interface MarkdownMessageProps {
  content: string;
  sources?: ResearchSource[] | undefined;
}

function CitationBadge({ num, source }: { num: number; source: ResearchSource | undefined }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowTooltip(true), 150);
  };

  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowTooltip(false), 100);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={() => setShowTooltip((s) => !s)}
    >
      <span className="mx-0.5 inline-flex h-5 min-w-[1.25rem] cursor-pointer items-center justify-center rounded-md bg-accent/15 px-1 text-xs font-semibold text-accent hover:bg-accent/25 transition-colors">
        {num}
      </span>
      {showTooltip && source ? (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 block w-64 -translate-x-1/2 rounded-xl border border-line bg-panel p-3 shadow-xl">
          <span className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md bg-accent/15 px-1 text-[10px] font-semibold text-accent">
              {num}
            </span>
            <span className="block min-w-0">
              <span className="block text-xs font-medium text-slate-200 line-clamp-2">{source.title}</span>
              <span className="mt-0.5 block text-[10px] text-slate-500">
                {(() => {
                  try {
                    return new URL(source.url).hostname.replace(/^www\./, '');
                  } catch {
                    return source.url;
                  }
                })()}
              </span>
              {source.snippet ? (
                <span className="mt-1 block text-[10px] text-slate-400 line-clamp-3">{source.snippet}</span>
              ) : null}
            </span>
          </span>
          <span className="absolute left-1/2 top-full block h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-line bg-panel" />
        </span>
      ) : null}
    </span>
  );
}

function CitationLink({ href, children, sources }: { href: string | undefined; children: React.ReactNode; sources?: ResearchSource[] | undefined }) {
  if (!href) return <span>{children}</span>;
  const match = href.match(/^#source-(\d+)$/);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    const source = sources?.find((s) => s.id === num);
    return <CitationBadge num={num} source={source} />;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline hover:text-white">
      {children}
    </a>
  );
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const language = (className?.replace('language-', '') || 'text') as string;
  const code = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Highlight theme={themes.vsDark} code={code} language={language}>
      {({ className: highlightClass, style, tokens, getLineProps, getTokenProps }) => (
        <div className="my-4 overflow-hidden rounded-xl border border-slate-700 bg-[#1e1e1e]">
          <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/50 px-4 py-2">
            <span className="text-xs text-slate-400 font-mono uppercase">{language}</span>
            <button
              onClick={handleCopy}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className={`${highlightClass} overflow-x-auto p-4 text-sm`} style={style}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="table-row">
                <span className="table-cell pr-4 text-right text-slate-600 select-none text-xs font-mono w-8">
                  {i + 1}
                </span>
                <span className="table-cell">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))}
          </pre>
        </div>
      )}
    </Highlight>
  );
}

export function MarkdownMessage({ content, sources }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 leading-7">{children}</p>,
        h1: ({ children }) => <h1 className="mb-3 mt-6 text-2xl font-bold text-white">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-5 text-xl font-semibold text-white">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold text-white">{children}</h3>,
        h4: ({ children }) => <h4 className="mb-2 mt-3 text-base font-semibold text-white">{children}</h4>,
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-6">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-6">{children}</ol>,
        li: ({ children }) => <li className="leading-7">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-4 border-accent pl-4 italic text-slate-300">{children}</blockquote>
        ),
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto">
            <table className="w-full border-collapse rounded-xl border border-slate-700 text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-800">{children}</thead>,
        th: ({ children }) => (
          <th className="border border-slate-700 px-3 py-2 text-left font-semibold text-white">{children}</th>
        ),
        td: ({ children }) => <td className="border border-slate-700 px-3 py-2 text-slate-200">{children}</td>,
        a: ({ href, children }) => <CitationLink href={href ?? ''} sources={sources}>{children}</CitationLink>,
        pre: ({ children }) => children,
        code: ({ children, className }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm font-mono text-accent">
                {children}
              </code>
            );
          }
          return <CodeBlock className={className}>{String(children)}</CodeBlock>;
        },
        hr: () => <hr className="my-4 border-slate-700" />,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        img: ({ src, alt }) => (
          <img
            src={src}
            alt={alt}
            className="my-3 max-w-full rounded-2xl border border-line shadow-lg"
            loading="lazy"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = 'none';
              target.parentElement?.classList.add('image-load-error');
            }}
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
