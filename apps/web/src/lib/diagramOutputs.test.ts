import { describe, expect, it } from 'vitest';
import { extractFencedCodeBlocks, summarizeDiagramOutputs } from './diagramOutputs';

describe('diagram output detection', () => {
  it('detects Mermaid fenced code blocks for previewable chat output', () => {
    const content = [
      'Here is the architecture:',
      '```mermaid',
      'flowchart TD',
      '  A[Web] --> B[API]',
      '```',
      'And the source can still be copied.',
    ].join('\n');

    expect(extractFencedCodeBlocks(content)).toEqual([
      {
        language: 'mermaid',
        code: 'flowchart TD\n  A[Web] --> B[API]',
      },
    ]);
    expect(summarizeDiagramOutputs(content)).toEqual({
      mermaidBlockCount: 1,
      hasMermaid: true,
      hasExcalidraw: false,
      labels: ['Mermaid'],
    });
  });

  it('detects Excalidraw JSON separately from Mermaid output', () => {
    const content = [
      '```json',
      '{"type":"excalidraw","elements":[]}',
      '```',
    ].join('\n');

    expect(summarizeDiagramOutputs(content)).toEqual({
      mermaidBlockCount: 0,
      hasMermaid: false,
      hasExcalidraw: true,
      labels: ['Excalidraw'],
    });
  });
});
