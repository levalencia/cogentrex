import { createId } from '../utils/id.js';
import type { ArtifactRepository, ArtifactRecord } from './artifactRepository.js';
import type { StreamSink } from '../chat/chatService.js';
import type { AppLogger } from '../observability/logger.js';

export interface DetectedArtifact {
  filename: string;
  language?: string;
  type: string;
  content: string;
}

const ARTIFACT_TAG_START = /<<<sage-artifact\s*\n/;
const ARTIFACT_TAG_END = /<<<sage-artifact-end>>>/;

export class ArtifactService {
  constructor(
    private readonly artifacts: ArtifactRepository,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Extract artifacts from LLM content that uses explicit artifact tags.
   */
  extractTaggedArtifacts(content: string): DetectedArtifact[] {
    const results: DetectedArtifact[] = [];
    const regex = /<<<sage-artifact\s*\n([\s\S]*?)\n>>>\n([\s\S]*?)\n<<<sage-artifact-end>>>/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const headerBlock = match[1]!;
      const body = match[2]!;

      const filename = this.extractHeaderField(headerBlock, 'filename');
      const artifactType = this.extractHeaderField(headerBlock, 'type') || 'application/vnd.code';
      const language = this.extractHeaderField(headerBlock, 'language') ?? undefined;

      if (filename) {
        results.push({
          filename,
          ...(language ? { language } : {}),
          type: artifactType,
          content: body.trim(),
        });
      }
    }
    return results;
  }

  /**
   * Heuristic extraction: detect fenced code blocks with >30 lines
   * and meaningful language identifiers.
   */
  extractHeuristicArtifacts(content: string): DetectedArtifact[] {
    const results: DetectedArtifact[] = [];
    const fenceRegex = /```([\w+]+)\s*(?:\n|$)([\s\S]*?)```/g;
    let match;
    while ((match = fenceRegex.exec(content)) !== null) {
      const lang = match[1]!.toLowerCase();
      const body = match[2]!.trim();
      const lineCount = body.split('\n').length;

      // Skip if too short or not a code language
      if (lineCount < 20) continue;
      const knownLanguages = [
        'python', 'javascript', 'typescript', 'js', 'ts', 'java', 'cpp', 'c++', 'c', 'go',
        'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'r', 'matlab', 'shell', 'bash',
        'zsh', 'powershell', 'sql', 'html', 'xml', 'css', 'scss', 'sass', 'less', 'json',
        'yaml', 'yml', 'toml', 'ini', 'dockerfile', 'makefile', 'cmake', 'graphql',
        'markdown', 'mdx', 'vue', 'svelte', 'astro',
      ];
      if (!knownLanguages.includes(lang)) continue;

      const filename = this.inferFilename(lang);
      results.push({
        filename,
        language: lang === 'python' ? 'python' : lang,
        type: 'application/vnd.code',
        content: body,
      });
    }
    return results;
  }

  /**
   * Persist an artifact to the database and emit a stream event.
   */
  async persistArtifact(
    userId: string,
    conversationId: string,
    messageId: string,
    detected: DetectedArtifact,
    emit: StreamSink,
  ): Promise<ArtifactRecord> {
    const record = await this.artifacts.create({
      userId,
      conversationId,
      messageId,
      type: detected.type,
      filename: detected.filename,
      language: detected.language ?? null,
      content: detected.content,
      sizeBytes: Buffer.byteLength(detected.content, 'utf-8'),
    });

    emit({
      type: 'artifact',
      filename: record.filename,
      ...(record.language ? { language: record.language } : {}),
      artifactType: record.type,
      content: record.content,
    });

    this.logger.info(
      { userId, conversationId, messageId, artifactId: record.id, filename: record.filename },
      'artifact_persisted',
    );

    return record;
  }

  private extractHeaderField(block: string, key: string): string | undefined {
    const regex = new RegExp(`^${key}:\\s*(.+)$`, 'm');
    const match = block.match(regex);
    return match?.[1]?.trim();
  }

  private inferFilename(lang: string): string {
    const map: Record<string, string> = {
      python: 'script.py',
      javascript: 'script.js',
      typescript: 'script.ts',
      js: 'script.js',
      ts: 'script.ts',
      java: 'Main.java',
      cpp: 'main.cpp',
      'c++': 'main.cpp',
      c: 'main.c',
      go: 'main.go',
      rust: 'main.rs',
      ruby: 'script.rb',
      php: 'index.php',
      swift: 'Main.swift',
      kotlin: 'Main.kt',
      scala: 'Main.scala',
      r: 'analysis.R',
      matlab: 'analysis.m',
      shell: 'script.sh',
      bash: 'script.sh',
      zsh: 'script.zsh',
      powershell: 'script.ps1',
      sql: 'query.sql',
      html: 'index.html',
      xml: 'data.xml',
      css: 'styles.css',
      scss: 'styles.scss',
      sass: 'styles.sass',
      less: 'styles.less',
      json: 'data.json',
      yaml: 'config.yaml',
      yml: 'config.yml',
      toml: 'config.toml',
      ini: 'config.ini',
      dockerfile: 'Dockerfile',
      makefile: 'Makefile',
      cmake: 'CMakeLists.txt',
      graphql: 'schema.graphql',
      markdown: 'README.md',
      mdx: 'page.mdx',
      vue: 'App.vue',
      svelte: 'App.svelte',
      astro: 'index.astro',
    };
    return map[lang] || `file.${lang}`;
  }
}
