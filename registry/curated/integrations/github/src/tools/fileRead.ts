/**
 * @fileoverview GitHub File Read tool — read file contents from a repository.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubFileReadTool {
  readonly name = 'github_file_read';
  readonly description = 'Read the contents of a file from a GitHub repository. Returns decoded UTF-8 text.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'path'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      path: { type: 'string' as const, description: 'File path within the repository' },
      ref: { type: 'string' as const, description: 'Branch, tag, or commit SHA (default: default branch)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    path: string;
    ref?: string;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.repos.getContent({
        owner: args.owner,
        repo: args.repo,
        path: args.path,
        ref: args.ref,
      });

      // getContent can return a file or directory listing
      if (Array.isArray(data)) {
        return {
          success: true,
          data: {
            type: 'directory',
            entries: data.map((e) => ({
              name: e.name,
              path: e.path,
              type: e.type,
              size: e.size,
            })),
          },
        };
      }

      if (data.type === 'file' && 'content' in data) {
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return {
          success: true,
          data: {
            type: 'file',
            path: data.path,
            size: data.size,
            encoding: 'utf-8',
            content,
            sha: data.sha,
          },
        };
      }

      return {
        success: true,
        data: {
          type: data.type,
          path: (data as any).path,
          size: (data as any).size,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
