export interface FencedCodeBlock {
  language: string;
  code: string;
}

export interface ExcalidrawElement {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  points?: Array<[number, number]>;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  isDeleted?: boolean;
}

export interface ExcalidrawArtifact {
  elements: ExcalidrawElement[];
  source: string;
  language: string;
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
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
  return parseExcalidrawArtifact(code) !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]);
}

function normalizeElement(value: unknown): ExcalidrawElement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.isDeleted === true) return null;

  const element: ExcalidrawElement = {};
  if (typeof raw.id === 'string') element.id = raw.id;
  if (typeof raw.type === 'string') element.type = raw.type;
  if (isFiniteNumber(raw.x)) element.x = raw.x;
  if (isFiniteNumber(raw.y)) element.y = raw.y;
  if (isFiniteNumber(raw.width)) element.width = raw.width;
  if (isFiniteNumber(raw.height)) element.height = raw.height;
  if (isFiniteNumber(raw.angle)) element.angle = raw.angle;
  if (typeof raw.strokeColor === 'string') element.strokeColor = raw.strokeColor;
  if (typeof raw.backgroundColor === 'string') element.backgroundColor = raw.backgroundColor;
  if (typeof raw.fillStyle === 'string') element.fillStyle = raw.fillStyle;
  if (isFiniteNumber(raw.strokeWidth)) element.strokeWidth = raw.strokeWidth;
  if (isFiniteNumber(raw.roughness)) element.roughness = raw.roughness;
  if (isFiniteNumber(raw.opacity)) element.opacity = raw.opacity;
  if (typeof raw.text === 'string') element.text = raw.text;
  if (isFiniteNumber(raw.fontSize)) element.fontSize = raw.fontSize;
  if (typeof raw.startArrowhead === 'string' || raw.startArrowhead === null) element.startArrowhead = raw.startArrowhead;
  if (typeof raw.endArrowhead === 'string' || raw.endArrowhead === null) element.endArrowhead = raw.endArrowhead;
  if (Array.isArray(raw.points)) element.points = raw.points.filter(isPoint);
  return element.type ? element : null;
}

export function parseExcalidrawArtifact(code: string, language = 'json'): ExcalidrawArtifact | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (value.type !== 'excalidraw' && !Array.isArray(value.elements)) return null;
    if (!Array.isArray(value.elements)) return null;
    const elements = value.elements.map(normalizeElement).filter((element): element is ExcalidrawElement => element !== null);
    if (!elements.length) return null;
    const artifact: ExcalidrawArtifact = {
      elements,
      source: trimmed,
      language,
    };
    if (value.appState && typeof value.appState === 'object' && !Array.isArray(value.appState)) artifact.appState = value.appState as Record<string, unknown>;
    if (value.files && typeof value.files === 'object' && !Array.isArray(value.files)) artifact.files = value.files as Record<string, unknown>;
    return artifact;
  } catch {
    return null;
  }
}

export function extractExcalidrawArtifacts(content: string): ExcalidrawArtifact[] {
  return extractFencedCodeBlocks(content)
    .filter((block) => ['json', 'excalidraw'].includes(block.language))
    .map((block) => parseExcalidrawArtifact(block.code, block.language))
    .filter((artifact): artifact is ExcalidrawArtifact => artifact !== null);
}

export function summarizeDiagramOutputs(content: string): DiagramOutputSummary {
  const blocks = extractFencedCodeBlocks(content);
  const mermaidBlockCount = blocks.filter((block) => block.language === 'mermaid').length;
  const hasExcalidraw = extractExcalidrawArtifacts(content).length > 0;
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
