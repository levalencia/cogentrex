import { createHash } from 'crypto';
import { HttpError } from '../http/errors.js';
import type { ImportManualSkillKitInput, ImportSkillKitInput } from '@cogentrex/shared';
import type { ImportedSkillFile, ImportedSkillKitSnapshot, SkillFileKind } from './skillRepository.js';

const MAX_FILES = 60;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 800 * 1024;

interface GitHubKitLocation {
  owner: string;
  repo: string;
  ref: string;
  folderPath: string;
  sourceUrl: string;
}

interface GitTreeEntry {
  path?: string;
  type?: string;
  size?: number;
}

interface GitTreeResponse {
  tree?: GitTreeEntry[];
}

let testFetchImpl: typeof fetch | null = null;

export function setSkillKitImportFetchForTests(fetchImpl: typeof fetch | null): void {
  testFetchImpl = fetchImpl;
}

export async function importSkillKitFromGitHub(input: ImportSkillKitInput, fetchImpl: typeof fetch = testFetchImpl ?? globalThis.fetch): Promise<ImportedSkillKitSnapshot> {
  const location = parseGitHubKitLocation(input);
  const treeUrl = `https://api.github.com/repos/${location.owner}/${location.repo}/git/trees/${encodeURIComponent(location.ref)}?recursive=1`;
  const treeResponse = await fetchImpl(treeUrl, { headers: { Accept: 'application/vnd.github+json' } });
  if (!treeResponse.ok) {
    throw new HttpError(400, 'SKILL_IMPORT_SOURCE_UNAVAILABLE', `Could not read GitHub tree (${treeResponse.status})`);
  }

  const tree = await treeResponse.json() as GitTreeResponse;
  const rootPrefix = location.folderPath ? `${location.folderPath}/` : '';
  const warnings: string[] = [];
  const rawCandidates = (tree.tree ?? [])
    .filter((entry): entry is Required<Pick<GitTreeEntry, 'path' | 'type'>> & GitTreeEntry => entry.type === 'blob' && typeof entry.path === 'string')
    .map((entry) => ({ ...entry, relativePath: toRelativePath(entry.path, rootPrefix) }))
    .filter((entry): entry is GitTreeEntry & { path: string; relativePath: string; type: string } => entry.relativePath !== null);

  const candidates: Array<GitTreeEntry & { path: string; relativePath: string; type: string; classification: { kind: SkillFileKind; contentType: string } }> = [];
  for (const entry of rawCandidates) {
    const classification = classifySkillKitFile(entry.relativePath);
    if (!classification) continue;
    if (entry.size && entry.size > MAX_FILE_BYTES) {
      warnings.push(`${entry.relativePath} skipped: larger than ${MAX_FILE_BYTES} bytes`);
      continue;
    }
    candidates.push({ ...entry, classification });
  }
  candidates.sort((left, right) => sortSkillKitPaths(left.relativePath, right.relativePath));

  if (!candidates.some((entry) => entry.relativePath === 'SKILL.md')) {
    throw new HttpError(400, 'SKILL_IMPORT_MISSING_SKILL_MD', 'Selected folder does not contain SKILL.md');
  }
  if (candidates.length > MAX_FILES) {
    throw new HttpError(400, 'SKILL_IMPORT_TOO_MANY_FILES', `Selected kit has ${candidates.length} supported files; limit is ${MAX_FILES}`);
  }

  const files: ImportedSkillFile[] = [];
  let totalBytes = 0;
  for (const candidate of candidates) {
    const rawUrl = buildRawUrl(location, candidate.path);
    const response = await fetchImpl(rawUrl);
    if (!response.ok) {
      warnings.push(`${candidate.relativePath} skipped: raw fetch returned ${response.status}`);
      continue;
    }
    const content = await response.text();
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    if (sizeBytes > MAX_FILE_BYTES) {
      warnings.push(`${candidate.relativePath} skipped: larger than ${MAX_FILE_BYTES} bytes after download`);
      continue;
    }
    if (totalBytes + sizeBytes > MAX_TOTAL_BYTES) {
      warnings.push(`${candidate.relativePath} skipped: import would exceed total ${MAX_TOTAL_BYTES} byte limit`);
      continue;
    }
    totalBytes += sizeBytes;
    if (candidate.classification.kind === 'script') {
      warnings.push(`${candidate.relativePath} stored as reference only; imported scripts are not executable`);
    }
    files.push({
      id: '',
      path: candidate.relativePath,
      kind: candidate.classification.kind,
      content,
      contentType: candidate.classification.contentType,
      sha256: createHash('sha256').update(content).digest('hex'),
      sizeBytes,
      executable: false,
    });
  }

  const skillMd = files.find((file) => file.path === 'SKILL.md');
  if (!skillMd) {
    throw new HttpError(400, 'SKILL_IMPORT_MISSING_SKILL_MD', 'SKILL.md could not be downloaded from selected folder');
  }

  const metadata = parseSkillMetadata(skillMd.content, location);
  return {
    id: '',
    slug: metadata.slug,
    name: metadata.name,
    description: metadata.description,
    sourceUrl: location.sourceUrl,
    sourceRef: location.ref,
    sourcePath: location.folderPath,
    files,
    warnings,
  };
}


export function importSkillKitFromManualFiles(input: ImportManualSkillKitInput): ImportedSkillKitSnapshot {
  const warnings: string[] = [];
  const rawPaths = input.files.map((file) => file.path.trim().replace(/^\/+|\/+$/g, '').replace(/\\/g, '/').replace(/\/+/g, '/'));
  const firstSegments = rawPaths.map((path) => path.split('/')[0]).filter(Boolean);
  const sharedRoot = firstSegments.length > 0 && firstSegments.every((segment) => segment === firstSegments[0]) && rawPaths.some((path) => path.includes('/'))
    ? `${firstSegments[0]}/`
    : '';
  const normalizedFiles = input.files.map((file, index) => ({
    path: normalizeManualFilePath(sharedRoot && rawPaths[index]?.startsWith(sharedRoot) ? rawPaths[index].slice(sharedRoot.length) : rawPaths[index] ?? file.path),
    content: file.content,
  }));
  const candidates: Array<{ path: string; content: string; classification: { kind: SkillFileKind; contentType: string } }> = [];
  for (const file of normalizedFiles) {
    const classification = classifySkillKitFile(file.path);
    if (!classification) {
      warnings.push(`${file.path} skipped: unsupported package file path`);
      continue;
    }
    candidates.push({ ...file, classification });
  }
  candidates.sort((left, right) => sortSkillKitPaths(left.path, right.path));
  if (!candidates.some((file) => file.path === 'SKILL.md')) {
    throw new HttpError(400, 'SKILL_IMPORT_MISSING_SKILL_MD', 'Manual package must include SKILL.md at the package root');
  }
  if (candidates.length > MAX_FILES) {
    throw new HttpError(400, 'SKILL_IMPORT_TOO_MANY_FILES', `Manual package has ${candidates.length} supported files; limit is ${MAX_FILES}`);
  }

  const seenPaths = new Set<string>();
  const files: ImportedSkillFile[] = [];
  let totalBytes = 0;
  for (const candidate of candidates) {
    if (seenPaths.has(candidate.path)) {
      warnings.push(`${candidate.path} skipped: duplicate file path`);
      continue;
    }
    seenPaths.add(candidate.path);
    const sizeBytes = Buffer.byteLength(candidate.content, 'utf8');
    if (sizeBytes > MAX_FILE_BYTES) {
      warnings.push(`${candidate.path} skipped: larger than ${MAX_FILE_BYTES} bytes`);
      continue;
    }
    if (totalBytes + sizeBytes > MAX_TOTAL_BYTES) {
      warnings.push(`${candidate.path} skipped: import would exceed total ${MAX_TOTAL_BYTES} byte limit`);
      continue;
    }
    totalBytes += sizeBytes;
    if (candidate.classification.kind === 'script') {
      warnings.push(`${candidate.path} stored as reference only; imported scripts are not executable`);
    }
    files.push({
      id: '',
      path: candidate.path,
      kind: candidate.classification.kind,
      content: candidate.content,
      contentType: candidate.classification.contentType,
      sha256: createHash('sha256').update(candidate.content).digest('hex'),
      sizeBytes,
      executable: false,
    });
  }

  const skillMd = files.find((file) => file.path === 'SKILL.md');
  if (!skillMd) {
    throw new HttpError(400, 'SKILL_IMPORT_MISSING_SKILL_MD', 'SKILL.md was skipped and could not be stored');
  }
  const sourceLabel = input.sourceLabel?.trim() || 'Manual upload';
  const metadata = parseManualSkillMetadata(skillMd.content, sourceLabel);
  return {
    id: '',
    slug: metadata.slug,
    name: metadata.name,
    description: metadata.description,
    sourceKind: 'manual',
    sourceUrl: '',
    sourceRef: '',
    sourcePath: '',
    sourceLabel,
    files,
    warnings,
  };
}

function normalizeManualFilePath(path: string): string {
  const normalized = path.trim().replace(/^\/+|\/+$/g, '').replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!normalized || normalized.split('/').some((part) => part === '..' || part === '.')) {
    throw new HttpError(400, 'SKILL_IMPORT_INVALID_FILE_PATH', 'Manual package file paths cannot be empty or contain . or .. segments');
  }
  return normalized;
}

function parseGitHubKitLocation(input: ImportSkillKitInput): GitHubKitLocation {
  const url = new URL(input.sourceUrl);
  if (url.hostname !== 'github.com') {
    throw new HttpError(400, 'SKILL_IMPORT_UNSUPPORTED_SOURCE', 'Only github.com skill kit imports are supported in v1');
  }
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2) {
    throw new HttpError(400, 'SKILL_IMPORT_INVALID_SOURCE', 'GitHub URL must include owner and repo');
  }
  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo) {
    throw new HttpError(400, 'SKILL_IMPORT_INVALID_SOURCE', 'GitHub URL must include owner and repo');
  }
  const treeIndex = parts.indexOf('tree');
  const urlRef = treeIndex >= 0 ? parts[treeIndex + 1] : undefined;
  const urlFolder = treeIndex >= 0 ? parts.slice(treeIndex + 2).join('/') : '';
  const ref = input.ref ?? urlRef ?? 'main';
  const folderPath = normalizeFolderPath(input.folderPath ?? urlFolder);
  return {
    owner,
    repo: repo.replace(/\.git$/, ''),
    ref,
    folderPath,
    sourceUrl: input.sourceUrl,
  };
}

function normalizeFolderPath(path: string): string {
  const normalized = path.trim().replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  if (!normalized) return '';
  if (normalized.split('/').some((part) => part === '..' || part === '.')) {
    throw new HttpError(400, 'SKILL_IMPORT_INVALID_FOLDER', 'Folder path cannot contain . or .. segments');
  }
  return normalized;
}

function toRelativePath(path: string, rootPrefix: string): string | null {
  if (!rootPrefix) return path;
  if (!path.startsWith(rootPrefix)) return null;
  const relative = path.slice(rootPrefix.length);
  return relative.length > 0 ? relative : null;
}

function classifySkillKitFile(path: string): { kind: SkillFileKind; contentType: string } | null {
  if (path === 'SKILL.md') return { kind: 'skill', contentType: 'text/markdown' };
  if (path === 'README.md') return { kind: 'reference', contentType: 'text/markdown' };
  if (/^references\/[^\0]+\.md$/u.test(path)) return { kind: 'reference', contentType: 'text/markdown' };
  if (/^templates\/[^\0]+\.(md|txt|json|ya?ml|html)$/u.test(path)) return { kind: 'template', contentType: contentTypeForPath(path) };
  if (/^assets\/[^\0]+\.(svg|json|txt|md)$/u.test(path)) return { kind: 'asset', contentType: contentTypeForPath(path) };
  if (/^scripts\/[^\0]+\.(py|sh|bash|js|ts)$/u.test(path)) return { kind: 'script', contentType: contentTypeForPath(path) };
  return null;
}

function contentTypeForPath(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'application/yaml';
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.md')) return 'text/markdown';
  return 'text/plain';
}

function sortSkillKitPaths(left: string, right: string): number {
  const rank = (path: string) => path === 'SKILL.md' ? 0 : path === 'README.md' ? 1 : 2;
  return rank(left) - rank(right) || left.localeCompare(right);
}

function buildRawUrl(location: GitHubKitLocation, fullPath: string): string {
  return `https://raw.githubusercontent.com/${location.owner}/${location.repo}/${encodeURIComponent(location.ref)}/${fullPath.split('/').map(encodeURIComponent).join('/')}`;
}

function parseManualSkillMetadata(content: string, sourceLabel: string): { slug: string; name: string; description: string } {
  const frontmatter = content.startsWith('---\n') ? content.slice(4, content.indexOf('\n---', 4)) : '';
  const yaml = parseFrontmatterMap(frontmatter);
  const name = yaml.get('name') ?? titleFromSlug(sourceLabel);
  const slug = slugify(name);
  const description = yaml.get('description') ?? firstMarkdownParagraph(content) ?? `Manual skill package uploaded from ${sourceLabel}.`;
  return { slug, name, description };
}

function parseSkillMetadata(content: string, location: GitHubKitLocation): { slug: string; name: string; description: string } {
  const frontmatter = content.startsWith('---\n') ? content.slice(4, content.indexOf('\n---', 4)) : '';
  const yaml = parseFrontmatterMap(frontmatter);
  const folderParts = location.folderPath.split('/').filter(Boolean);
  const fallbackName = titleFromSlug(folderParts[folderParts.length - 1] ?? location.repo);
  const name = yaml.get('name') ?? fallbackName;
  const slug = slugify(name);
  const description = yaml.get('description') ?? firstMarkdownParagraph(content) ?? `Imported skill kit from ${location.owner}/${location.repo}.`;
  return { slug, name, description };
}

function parseFrontmatterMap(frontmatter: string): Map<string, string> {
  const yaml = new Map<string, string>();
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/u);
    const key = match?.[1];
    const value = match?.[2];
    if (key && value) yaml.set(key.toLowerCase(), value.replace(/^['"]|['"]$/g, '').trim());
  }
  return yaml;
}

function firstMarkdownParagraph(content: string): string | null {
  const withoutFrontmatter = content.startsWith('---\n') && content.includes('\n---', 4)
    ? content.slice(content.indexOf('\n---', 4) + 4)
    : content;
  const paragraph = withoutFrontmatter
    .split(/\n\s*\n/u)
    .map((part) => part.replace(/^#+\s*/u, '').trim())
    .find((part) => part.length > 0);
  return paragraph ? paragraph.slice(0, 500) : null;
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'imported-skill';
}

function titleFromSlug(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
