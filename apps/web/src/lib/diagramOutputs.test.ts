import { describe, expect, it } from 'vitest';
import { extractExcalidrawArtifacts, extractFencedCodeBlocks, parseExcalidrawArtifact, summarizeDiagramOutputs } from './diagramOutputs';

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

  it('detects and parses Excalidraw JSON separately from Mermaid output', () => {
    const excalidrawJson = JSON.stringify({
      type: 'excalidraw',
      elements: [
        { id: 'box-1', type: 'rectangle', x: 10, y: 20, width: 120, height: 60, strokeColor: '#1e293b', backgroundColor: '#dbeafe' },
        { id: 'label-1', type: 'text', x: 24, y: 38, width: 80, height: 24, text: 'Adapter' },
      ],
    });
    const content = [
      '```json',
      excalidrawJson,
      '```',
    ].join('\n');

    expect(parseExcalidrawArtifact(excalidrawJson)?.elements).toHaveLength(2);
    expect(extractExcalidrawArtifacts(content)).toHaveLength(1);
    expect(summarizeDiagramOutputs(content)).toEqual({
      mermaidBlockCount: 0,
      hasMermaid: false,
      hasExcalidraw: true,
      labels: ['Excalidraw'],
    });
  });
});
