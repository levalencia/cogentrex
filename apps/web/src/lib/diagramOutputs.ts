export interface FencedCodeBlock {
  language: string;
  code: string;
}

export interface DiagramOutputSummary {
  mermaidBlockCount: number;
  hasMermaid: boolean;
  hasExcalidraw: boolean;
  labels: string[];
}

const fencedCodeBlockPattern = /```([^\n`]*)\n([\s\S]*?)```/g;

export function extractFencedCodeBlocks(content: string): FencedCodeBlock[] {
  return Array.from(content.matchAll(fencedCodeBlockPattern)).map((match) => ({
    language: (match[1] ?? '').trim().toLowerCase(),
    code: (match[2] ?? '').replace(/\n$/, ''),
  }));
}

function looksLikeExcalidraw(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const value = parsed as Record<string, unknown>;
    return value.type === 'excalidraw' || Array.isArray(value.elements);
  } catch {
    return /"type"\s*:\s*"excalidraw"/.test(trimmed) || /"elements"\s*:\s*\[/.test(trimmed);
  }
}

export function summarizeDiagramOutputs(content: string): DiagramOutputSummary {
  const blocks = extractFencedCodeBlocks(content);
  const mermaidBlockCount = blocks.filter((block) => block.language === 'mermaid').length;
  const hasExcalidraw = blocks.some((block) => ['json', 'excalidraw'].includes(block.language) && looksLikeExcalidraw(block.code));
  const labels = [
    mermaidBlockCount > 0 ? 'Mermaid' : null,
    hasExcalidraw ? 'Excalidraw' : null,
  ].filter((label): label is string => Boolean(label));

  return {
    mermaidBlockCount,
    hasMermaid: mermaidBlockCount > 0,
    hasExcalidraw,
    labels,
  };
}
