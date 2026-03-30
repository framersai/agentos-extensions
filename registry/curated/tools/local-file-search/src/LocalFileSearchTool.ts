/**
 * @fileoverview Local File Search — find files on the host filesystem by fuzzy name matching.
 *
 * Searches the full filesystem (or a specified directory) with a configurable denylist
 * to exclude sensitive paths. Results are ranked by relevance: exact > startsWith > contains > fuzzy.
 *
 * @module agentos-ext-local-file-search/LocalFileSearchTool
 */

import { readdir, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import type {
  FileSearchConfig,
  FileMatch,
  LocalFileSearchInput,
  LocalFileSearchOutput,
} from './types.js';
import { DEFAULT_FILE_SEARCH_CONFIG } from './types.js';

/** MIME type map for common file extensions. */
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
  '.txt': 'text/plain', '.json': 'application/json',
  '.csv': 'text/csv', '.md': 'text/markdown',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/**
 * ITool implementation for local filesystem search.
 * Walks directories recursively, matches files by name, and ranks by relevance.
 */
export class LocalFileSearchTool {
  readonly id = 'local_file_search';
  readonly name = 'local_file_search';
  readonly displayName = 'Local File Search';
  readonly description = 'Search for files on the local filesystem by name. Returns matching files sorted by relevance.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Filename or partial filename to search for' },
      directory: { type: 'string', description: 'Specific directory to search (overrides default scope)' },
    },
    required: ['query'],
  };

  private config: FileSearchConfig;

  constructor(config?: Partial<FileSearchConfig>) {
    this.config = { ...DEFAULT_FILE_SEARCH_CONFIG, ...config };
  }

  /** Execute the file search. */
  async execute(input: LocalFileSearchInput): Promise<LocalFileSearchOutput> {
    const query = input.query.toLowerCase();
    const rootDir = input.directory ?? '/';
    const matches: FileMatch[] = [];
    let directoriesScanned = 0;
    let timedOut = false;
    const startTime = Date.now();

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > this.config.maxDepth) return;
      if (Date.now() - startTime > this.config.timeoutMs) { timedOut = true; return; }
      if (this.isDeniedDir(dir)) return;

      directoriesScanned++;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch { return; } // permission denied, etc.

      for (const entry of entries) {
        if (timedOut) return;
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!this.isDeniedDir(entry.name) && !this.isDeniedDir(fullPath)) {
            await walk(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          if (this.isDeniedFile(entry.name)) continue;
          const relevance = this.scoreRelevance(entry.name.toLowerCase(), query);
          if (relevance > 0) {
            try {
              const fileStat = await stat(fullPath);
              matches.push({
                path: fullPath,
                name: entry.name,
                size: fileStat.size,
                modified: fileStat.mtime.toISOString(),
                mimeType: MIME_MAP[extname(entry.name).toLowerCase()] ?? 'application/octet-stream',
                relevance,
              });
            } catch { /* stat failed — skip */ }
          }
        }
      }
    };

    await walk(rootDir, 0);

    matches.sort((a, b) => b.relevance - a.relevance);
    return {
      matches: matches.slice(0, this.config.maxResults),
      directoriesScanned,
      timedOut,
    };
  }

  /** Score how well a filename matches the query. 0 = no match. */
  private scoreRelevance(filename: string, query: string): number {
    const nameNoExt = filename.replace(/\.[^.]+$/, '');
    if (filename === query) return 1.0;           // exact match
    if (nameNoExt === query) return 0.95;          // match without extension
    if (filename.startsWith(query)) return 0.8;    // starts with
    if (nameNoExt.startsWith(query)) return 0.75;
    if (filename.includes(query)) return 0.6;      // contains
    if (nameNoExt.includes(query)) return 0.55;
    // Levenshtein for fuzzy (only if query is close in length)
    if (Math.abs(nameNoExt.length - query.length) <= 3) {
      const dist = this.levenshtein(nameNoExt, query);
      if (dist <= 3) return 0.3 - (dist * 0.08);
    }
    return 0;
  }

  /** Check if a directory name or path is in the denylist. */
  private isDeniedDir(nameOrPath: string): boolean {
    const base = basename(nameOrPath);
    return this.config.denylist.some(pattern => {
      if (pattern.startsWith('*')) return false; // glob patterns are for files only
      if (pattern.startsWith('/')) return nameOrPath.startsWith(pattern);
      if (pattern.startsWith('.')) return base === pattern;
      return base === pattern;
    });
  }

  /** Check if a filename matches a glob-style denylist pattern (e.g., *.key). */
  private isDeniedFile(filename: string): boolean {
    return this.config.denylist.some(pattern => {
      if (pattern.startsWith('*.')) {
        return filename.endsWith(pattern.slice(1));
      }
      return false;
    });
  }

  /** Simple Levenshtein distance for fuzzy matching. */
  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }
}
