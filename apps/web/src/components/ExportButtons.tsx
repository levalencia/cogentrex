'use client';

import type { ResearchSource } from '@cogentrex/shared';

interface ExportButtonsProps {
  content: string;
  sources: ResearchSource[];
}

export function ExportButtons({ content, sources }: ExportButtonsProps) {
  if (!content) return null;

  function exportMarkdown() {
    const sourceSection = sources.length
      ? `\n\n## Sources\n\n${sources.map((s) => `[${s.id}] ${s.title} - ${s.url}`).join('\n')}`
      : '';
    const markdown = `# Research Report\n\n${content}${sourceSection}`;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cogentrex-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const sourceHTML = sources.length
      ? `<h2>Sources</h2><ul>${sources.map((s) => `<li>[${s.id}] <a href="${s.url}">${s.title}</a></li>`).join('')}</ul>`
      : '';
    printWindow.document.write(`
      <html>
        <head>
          <title>Cogentrex Research Report</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.6; color: #1a1a1a; }
            h1 { font-size: 1.5rem; margin-bottom: 1rem; }
            h2 { font-size: 1.25rem; margin-top: 2rem; }
            a { color: #2563eb; }
            li { margin: 0.25rem 0; }
            pre { background: #f4f4f5; padding: 1rem; border-radius: 8px; overflow-x: auto; }
            code { background: #f4f4f5; padding: 0.125rem 0.375rem; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>Research Report</h1>
          <div>${content.replace(/\n/g, '<br/>')}</div>
          ${sourceHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={exportMarkdown}
        className="rounded-xl border border-line px-3 py-1.5 text-xs text-slate-300 hover:border-accent"
      >
        Export Markdown
      </button>
      <button
        onClick={exportPDF}
        className="rounded-xl border border-line px-3 py-1.5 text-xs text-slate-300 hover:border-accent"
      >
        Export PDF
      </button>
    </div>
  );
}
