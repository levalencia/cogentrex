'use client';

import { useState } from 'react';
import type { ArtifactItem } from '@cogentrex/shared';
import { useAppStore } from '@/store/appStore';
import { Highlight, themes } from 'prism-react-renderer';
import { MarkdownMessage } from '@/components/MarkdownMessage';

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    py: 'python', js: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx',
    java: 'java', cpp: 'cpp', c: 'c', go: 'go', rs: 'rust', rb: 'ruby',
    php: 'php', swift: 'swift', kt: 'kotlin', scala: 'scala', r: 'r',
    m: 'matlab', sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
    sql: 'sql', html: 'html', xml: 'xml', css: 'css', scss: 'scss',
    sass: 'sass', json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    ini: 'ini', dockerfile: 'dockerfile', make: 'makefile', graphql: 'graphql',
    md: 'markdown', mdx: 'markdown', vue: 'vue', svelte: 'svelte', astro: 'astro',
  };
  return map[ext] || ext || 'text';
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html', htm: 'text/html', svg: 'image/svg+xml',
    md: 'text/markdown', mdx: 'text/markdown',
  };
  return map[ext] || 'application/vnd.code';
}

function ArtifactViewer({ artifact }: { artifact: ArtifactItem }) {
  const [copied, setCopied] = useState(false);
  const language = artifact.language || getLanguage(artifact.filename);
  const mimeType = getMimeType(artifact.filename);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: mimeType === 'application/vnd.code' ? 'text/plain' : mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render HTML/SVG previews
  if (mimeType === 'text/html') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/50 px-4 py-2">
          <span className="text-xs text-slate-400 font-mono uppercase">{artifact.filename}</span>
          <div className="flex gap-2">
            <button onClick={handleCopy} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">{copied ? '✓ Copied' : 'Copy'}</button>
            <button onClick={handleDownload} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">Download</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <iframe srcDoc={artifact.content} className="h-full w-full rounded border border-slate-700 bg-white" title={artifact.filename} sandbox="allow-scripts" />
        </div>
      </div>
    );
  }

  if (mimeType === 'image/svg+xml') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/50 px-4 py-2">
          <span className="text-xs text-slate-400 font-mono uppercase">{artifact.filename}</span>
          <div className="flex gap-2">
            <button onClick={handleCopy} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">{copied ? '✓ Copied' : 'Copy'}</button>
            <button onClick={handleDownload} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">Download</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div dangerouslySetInnerHTML={{ __html: artifact.content }} className="rounded border border-slate-700 bg-white p-4" />
        </div>
      </div>
    );
  }

  if (mimeType === 'text/markdown') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/50 px-4 py-2">
          <span className="text-xs text-slate-400 font-mono uppercase">{artifact.filename}</span>
          <div className="flex gap-2">
            <button onClick={handleCopy} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">{copied ? '✓ Copied' : 'Copy'}</button>
            <button onClick={handleDownload} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">Download</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 text-sm text-slate-200">
          <MarkdownMessage content={artifact.content} />
        </div>
      </div>
    );
  }

  // Default: syntax highlighted code
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/50 px-4 py-2">
        <span className="text-xs text-slate-400 font-mono uppercase">{artifact.filename}</span>
        <div className="flex gap-2">
          <button onClick={handleCopy} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">{copied ? '✓ Copied' : 'Copy'}</button>
          <button onClick={handleDownload} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">Download</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <Highlight theme={themes.vsDark} code={artifact.content} language={language}>
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={`${className} p-4 text-sm`} style={style}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })} className="table-row">
                  <span className="table-cell pr-4 text-right text-slate-600 select-none text-xs font-mono w-8">{i + 1}</span>
                  <span className="table-cell">
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}

export function ArtifactsPanel() {
  const artifacts = useAppStore((state) => state.artifacts);
  const selectedArtifactId = useAppStore((state) => state.selectedArtifactId);
  const artifactPanelOpen = useAppStore((state) => state.artifactPanelOpen);
  const selectArtifact = useAppStore((state) => state.selectArtifact);
  const closeArtifactPanel = useAppStore((state) => state.closeArtifactPanel);

  if (!artifactPanelOpen || artifacts.length === 0) return null;

  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId) ?? artifacts[0];

  return (
    <div className="flex h-full w-[420px] flex-col border-l border-line bg-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Artifacts</h3>
        <button onClick={closeArtifactPanel} className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line bg-ink/50 overflow-x-auto px-2 py-2">
        {artifacts.map((artifact) => (
          <button
            key={artifact.id}
            onClick={() => selectArtifact(artifact.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-mono whitespace-nowrap transition-colors ${
              selectedArtifact?.id === artifact.id
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'text-slate-400 hover:bg-slate-700 hover:text-white border border-transparent'
            }`}
            title={artifact.filename}
          >
            {artifact.filename.length > 20 ? artifact.filename.slice(0, 18) + '…' : artifact.filename}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {selectedArtifact ? (
          <ArtifactViewer artifact={selectedArtifact} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Select an artifact</div>
        )}
      </div>
    </div>
  );
}
