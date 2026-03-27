/**
 * @fileoverview GitHub Repo Index tool — fetch repository metadata, tree, README,
 * docs, and package.json for RAG indexing. Returns an array of text chunks suitable
 * for embedding or search indexing.
 */

import type { GitHubService } from '../GitHubService.js';

/** A single indexable chunk returned by the repo index tool. */
interface IndexChunk {
  /** Chunk type: "metadata" | "tree" | "readme" | "doc" | "package_json" */
  type: string;
  /** Human-readable label for the chunk. */
  label: string;
  /** The actual content to index. */
  content: string;
}

export class GitHubRepoIndexTool {
  readonly name = 'github_repo_index';
  readonly description =
    'Fetch a repository\'s metadata, file tree, README, doc files, and package.json. ' +
    'Returns an array of text chunks ready for RAG indexing or embedding.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      ref: { type: 'string' as const, description: 'Branch, tag, or SHA (default: default branch)' },
      max_doc_files: { type: 'number' as const, description: 'Max number of doc files to fetch (default: 10)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    ref?: string;
    max_doc_files?: number;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const { owner, repo } = args;
      const maxDocs = args.max_doc_files ?? 10;
      const chunks: IndexChunk[] = [];

      // 1. Repository metadata
      const metadata = await this.service.getRepoMetadata(owner, repo);
      const ref = args.ref ?? metadata.defaultBranch;

      chunks.push({
        type: 'metadata',
        label: `${metadata.fullName} metadata`,
        content: [
          `Repository: ${metadata.fullName}`,
          metadata.description ? `Description: ${metadata.description}` : null,
          `Language: ${metadata.language ?? 'unknown'}`,
          `Stars: ${metadata.stars} | Forks: ${metadata.forks}`,
          `Topics: ${metadata.topics.length ? metadata.topics.join(', ') : 'none'}`,
          `Default branch: ${metadata.defaultBranch}`,
          `License: ${metadata.license ?? 'none'}`,
          `URL: ${metadata.htmlUrl}`,
        ]
          .filter(Boolean)
          .join('\n'),
      });

      // 2. File tree
      const tree = await this.service.getRepoTree(owner, repo, ref);
      const treePaths = tree
        .filter((e) => e.type === 'blob')
        .map((e) => e.path);

      chunks.push({
        type: 'tree',
        label: `${metadata.fullName} file tree (${treePaths.length} files)`,
        content: treePaths.join('\n'),
      });

      // 3. README (try common filenames)
      const readmeCandidates = treePaths.filter(
        (p) => /^readme(\.\w+)?$/i.test(p.split('/').pop() ?? '') && !p.includes('/'),
      );
      for (const readmePath of readmeCandidates.slice(0, 1)) {
        try {
          const content = await this.service.getFileContent(owner, repo, readmePath, ref);
          chunks.push({
            type: 'readme',
            label: `${metadata.fullName} ${readmePath}`,
            content,
          });
        } catch {
          // README might be too large or binary — skip silently
        }
      }

      // 4. Doc files (markdown in docs/, doc/, documentation/)
      const docPaths = treePaths.filter((p) => {
        const lower = p.toLowerCase();
        return (
          (lower.startsWith('docs/') ||
            lower.startsWith('doc/') ||
            lower.startsWith('documentation/')) &&
          lower.endsWith('.md')
        );
      });
      for (const docPath of docPaths.slice(0, maxDocs)) {
        try {
          const content = await this.service.getFileContent(owner, repo, docPath, ref);
          chunks.push({
            type: 'doc',
            label: `${metadata.fullName} ${docPath}`,
            content,
          });
        } catch {
          // Skip unreadable docs
        }
      }

      // 5. package.json (if present at root)
      if (treePaths.includes('package.json')) {
        try {
          const content = await this.service.getFileContent(owner, repo, 'package.json', ref);
          chunks.push({
            type: 'package_json',
            label: `${metadata.fullName} package.json`,
            content,
          });
        } catch {
          // Skip if unreadable
        }
      }

      return {
        success: true,
        data: {
          owner,
          repo,
          ref,
          chunk_count: chunks.length,
          chunks,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
