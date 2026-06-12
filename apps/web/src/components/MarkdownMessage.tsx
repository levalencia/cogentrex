'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
import { useState, useRef, useEffect } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ResearchSource } from '@cogentrex/shared';
import { parseExcalidrawArtifact } from '@/lib/diagramOutputs';
import type { ExcalidrawArtifact, ExcalidrawElement } from '@/lib/diagramOutputs';

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

function MermaidPreview({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number; pointerId: number } | null>(null);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const openExpanded = () => {
    setZoom(1.25);
    setPan({ x: 0, y: 0 });
    setIsExpanded(true);
  };

  const zoomBy = (delta: number) => {
    setZoom((value) => Math.min(3, Math.max(0.5, Number((value + delta).toFixed(2)))));
  };

  const panBy = (x: number, y: number) => {
    setPan((value) => ({ x: value.x + x, y: value.y + y }));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, pointerId: event.pointerId };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;
    setPan({ x: dragStart.panX + event.clientX - dragStart.x, y: dragStart.panY + event.clientY - dragStart.y });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (dragStart) event.currentTarget.releasePointerCapture(dragStart.pointerId);
    dragStartRef.current = null;
    setIsPanning(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    let cancelled = false;
    const renderMermaid = async () => {
      try {
        setError(null);
        setSvg(null);
        setIsExpanded(false);
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(id, code);
        if (!cancelled) setSvg(result.svg);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to render Mermaid diagram.');
      }
    };

    void renderMermaid();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!isExpanded) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
      if ((event.metaKey || event.ctrlKey) && event.key === '=') zoomBy(0.25);
      if ((event.metaKey || event.ctrlKey) && event.key === '-') zoomBy(-0.25);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/70 px-4 py-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Mermaid preview</span>
          <span className="ml-2 text-[11px] text-slate-500">diagram artifact candidate</span>
        </div>
        <div className="flex items-center gap-2">
          {svg ? (
            <button
              onClick={openExpanded}
              className="rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
            >
              Expand
            </button>
          ) : null}
          <button
            onClick={() => setShowSource((value) => !value)}
            className="rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          >
            {showSource ? 'Hide source' : 'View source'}
          </button>
          <button
            onClick={handleCopy}
            className="rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto bg-slate-950 p-4">
        {error ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Mermaid could not render this diagram. Use View source to inspect the code.
            <div className="mt-1 text-xs text-amber-200/80">{error}</div>
          </div>
        ) : svg ? (
          <button
            type="button"
            onClick={openExpanded}
            className="group block min-w-max rounded-lg border border-transparent p-2 text-left transition-colors hover:border-accent/30 hover:bg-accent/5 focus:outline-none focus:ring-2 focus:ring-accent/50"
            aria-label="Open Mermaid diagram in larger viewer"
          >
            <span className="mermaid-preview block" dangerouslySetInnerHTML={{ __html: svg }} />
            <span className="mt-2 block text-center text-[11px] text-slate-500 transition-colors group-hover:text-accent">Click to expand, zoom, and pan</span>
          </button>
        ) : (
          <div className="text-sm text-slate-400">Rendering Mermaid diagram…</div>
        )}
      </div>
      {showSource ? <CodeBlock className="language-text">{code}</CodeBlock> : null}
      {isExpanded && svg ? (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 p-4 backdrop-blur-sm" onClick={() => setIsExpanded(false)}>
          <div
            className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Expanded Mermaid diagram viewer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Mermaid diagram</p>
                <p className="text-xs text-slate-500">Zoom with controls; pan with arrows or drag the canvas.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => zoomBy(-0.25)} className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800" aria-label="Zoom out">−</button>
                <span className="min-w-14 text-center text-xs text-slate-400">{Math.round(zoom * 100)}%</span>
                <button onClick={() => zoomBy(0.25)} className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800" aria-label="Zoom in">+</button>
                <button onClick={resetView} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800">Reset</button>
                <div className="grid grid-cols-3 gap-1" aria-label="Pan controls">
                  <span />
                  <button onClick={() => panBy(0, -80)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" aria-label="Pan up">↑</button>
                  <span />
                  <button onClick={() => panBy(-80, 0)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" aria-label="Pan left">←</button>
                  <button onClick={resetView} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" aria-label="Center diagram">•</button>
                  <button onClick={() => panBy(80, 0)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" aria-label="Pan right">→</button>
                  <span />
                  <button onClick={() => panBy(0, 80)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" aria-label="Pan down">↓</button>
                  <span />
                </div>
                <button onClick={() => setIsExpanded(false)} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800">Close</button>
              </div>
            </div>
            <div
              className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-slate-950 p-8 ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <div
                className="mermaid-preview min-w-max select-none rounded-xl bg-slate-900/50 p-6 shadow-xl"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function elementBounds(element: ExcalidrawElement): { minX: number; minY: number; maxX: number; maxY: number } {
  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const width = element.width ?? 0;
  const height = element.height ?? 0;
  const points = element.points?.length ? element.points : null;
  if (points) {
    const absolutePoints = points.map((point) => ({ x: x + point[0], y: y + point[1] }));
    return {
      minX: Math.min(...absolutePoints.map((point) => point.x), x),
      minY: Math.min(...absolutePoints.map((point) => point.y), y),
      maxX: Math.max(...absolutePoints.map((point) => point.x), x + width),
      maxY: Math.max(...absolutePoints.map((point) => point.y), y + height),
    };
  }
  return {
    minX: Math.min(x, x + width),
    minY: Math.min(y, y + height),
    maxX: Math.max(x, x + width),
    maxY: Math.max(y, y + height),
  };
}

function excalidrawBounds(elements: ExcalidrawElement[]) {
  const bounds = elements.map(elementBounds);
  const minX = Math.min(...bounds.map((bound) => bound.minX));
  const minY = Math.min(...bounds.map((bound) => bound.minY));
  const maxX = Math.max(...bounds.map((bound) => bound.maxX));
  const maxY = Math.max(...bounds.map((bound) => bound.maxY));
  const padding = 48;
  return {
    viewBox: `${minX - padding} ${minY - padding} ${Math.max(maxX - minX + padding * 2, 240)} ${Math.max(maxY - minY + padding * 2, 160)}`,
  };
}

function excalidrawFill(element: ExcalidrawElement): string {
  const background = element.backgroundColor?.trim();
  if (!background || background === 'transparent') return 'none';
  return background;
}

function excalidrawStroke(element: ExcalidrawElement): string {
  return element.strokeColor?.trim() || '#f8fafc';
}

function ExcalidrawElementSvg({ element, markerId }: { element: ExcalidrawElement; markerId: string }) {
  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const width = Math.abs(element.width ?? 0);
  const height = Math.abs(element.height ?? 0);
  const stroke = excalidrawStroke(element);
  const fill = excalidrawFill(element);
  const strokeWidth = element.strokeWidth ?? 2;
  const opacity = element.opacity == null ? 1 : Math.max(0, Math.min(1, element.opacity / 100));
  const rotation = element.angle ? `rotate(${element.angle * (180 / Math.PI)} ${x + width / 2} ${y + height / 2})` : undefined;

  if (element.type === 'text') {
    return (
      <text
        x={x}
        y={y + (element.fontSize ?? 20)}
        fill={stroke}
        fontSize={element.fontSize ?? 20}
        fontFamily="Virgil, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        opacity={opacity}
        transform={rotation}
      >
        {element.text ?? ''}
      </text>
    );
  }

  if (element.type === 'arrow' || element.type === 'line') {
    const points: Array<[number, number]> = element.points?.length ? element.points : [[0, 0], [element.width ?? 0, element.height ?? 0]];
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x + point[0]} ${y + point[1]}`).join(' ');
    const markerEnd = element.type === 'arrow' && element.endArrowhead !== null ? `url(#${markerId})` : undefined;
    return <path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} markerEnd={markerEnd} strokeLinecap="round" strokeLinejoin="round" />;
  }

  if (element.type === 'ellipse') {
    return <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} transform={rotation} />;
  }

  if (element.type === 'diamond') {
    const points = [
      `${x + width / 2},${y}`,
      `${x + width},${y + height / 2}`,
      `${x + width / 2},${y + height}`,
      `${x},${y + height / 2}`,
    ].join(' ');
    return <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} transform={rotation} />;
  }

  return <rect x={x} y={y} width={width} height={height} rx={12} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} transform={rotation} />;
}

function ExcalidrawPreview({ code, artifact }: { code: string; artifact: ExcalidrawArtifact }) {
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const markerId = useRef(`excalidraw-arrow-${Math.random().toString(36).slice(2)}`).current;
  const bounds = excalidrawBounds(artifact.elements);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/70 px-4 py-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Excalidraw preview</span>
          <span className="ml-2 text-[11px] text-slate-500">JSON artifact candidate</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSource((value) => !value)}
            className="rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          >
            {showSource ? 'Hide source' : 'View source'}
          </button>
          <button
            onClick={handleCopy}
            className="rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto bg-[#f8f5ee] p-4">
        <svg viewBox={bounds.viewBox} className="min-h-64 w-full min-w-[520px] rounded-lg bg-[#fdfaf3] shadow-inner" role="img" aria-label="Rendered Excalidraw diagram">
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#1e293b" />
            </marker>
          </defs>
          {artifact.elements.map((element, index) => (
            <ExcalidrawElementSvg key={element.id ?? index} element={element} markerId={markerId} />
          ))}
        </svg>
      </div>
      {showSource ? <CodeBlock className="language-text">{code}</CodeBlock> : null}
    </div>
  );
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const language = (className?.replace('language-', '') || 'text') as string;
  const code = String(children).replace(/\n$/, '');
  const excalidrawArtifact = ['json', 'excalidraw'].includes(language) ? parseExcalidrawArtifact(code, language) : null;

  if (language === 'mermaid') return <MermaidPreview code={code} />;
  if (excalidrawArtifact) return <ExcalidrawPreview code={code} artifact={excalidrawArtifact} />;

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
