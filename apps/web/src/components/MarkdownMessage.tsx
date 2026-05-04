'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
import { useState } from 'react';

interface MarkdownMessageProps {
  content: string;
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

export function MarkdownMessage({ content }: MarkdownMessageProps) {
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
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-accent underline hover:text-white">
            {children}
          </a>
        ),
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
