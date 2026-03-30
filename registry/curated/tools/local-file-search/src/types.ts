/**
 * @fileoverview Types for the local-file-search extension tool.
 * @module agentos-ext-local-file-search/types
 */

/** Configuration for file search scope and behavior. */
export interface FileSearchConfig {
  /** Directories and glob patterns to exclude from search. */
  denylist: string[];
  /** Maximum number of results to return. */
  maxResults: number;
  /** Maximum directory depth to traverse. */
  maxDepth: number;
  /** Timeout in milliseconds — returns best results found so far. */
  timeoutMs: number;
}

/** A single file match result. */
export interface FileMatch {
  /** Absolute path to the file. */
  path: string;
  /** File name (basename). */
  name: string;
  /** File size in bytes. */
  size: number;
  /** ISO 8601 last modified timestamp. */
  modified: string;
  /** Detected MIME type based on extension. */
  mimeType: string;
  /** Relevance score (higher is better). */
  relevance: number;
}

/** Input schema for the local_file_search tool. */
export interface LocalFileSearchInput {
  /** Filename or partial filename to search for. */
  query: string;
  /** Specific directory to search (overrides full filesystem scan). */
  directory?: string;
}

/** Output schema for the local_file_search tool. */
export interface LocalFileSearchOutput {
  /** Array of matching files sorted by relevance. */
  matches: FileMatch[];
  /** Number of directories scanned. */
  directoriesScanned: number;
  /** Whether the search timed out before completing. */
  timedOut: boolean;
}

/** Default file search configuration. */
export const DEFAULT_FILE_SEARCH_CONFIG: FileSearchConfig = {
  denylist: [
    '/proc', '/sys', '/dev',
    'node_modules', '.git', '.env',
    '.ssh', '.gnupg', '.aws',
    '*.key', '*.pem', '*.secret',
  ],
  maxResults: 10,
  maxDepth: 10,
  timeoutMs: 10_000,
};
