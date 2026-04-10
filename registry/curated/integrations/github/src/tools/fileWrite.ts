// @ts-nocheck
/**
 * @fileoverview GitHub File Write tool — create or update a file in a repository.
 * Content is automatically base64-encoded before sending to the API.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubFileWriteTool {
  readonly name = 'github_file_write';
  readonly description = 'Create or update a file in a GitHub repository. Provide the SHA of the existing file to update it; omit SHA to create a new file.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'path', 'content', 'message'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      path: { type: 'string' as const, description: 'File path within the repository' },
      content: { type: 'string' as const, description: 'File content (plain text — will be base64-encoded automatically)' },
      message: { type: 'string' as const, description: 'Commit message' },
      branch: { type: 'string' as const, description: 'Target branch (default: repo default branch)' },
      sha: { type: 'string' as const, description: 'SHA of the file being replaced (required for updates, omit for new files)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch?: string;
    sha?: string;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const encoded = Buffer.from(args.content).toString('base64');

      const { data } = await octokit.rest.repos.createOrUpdateFileContents({
        owner: args.owner,
        repo: args.repo,
        path: args.path,
        message: args.message,
        content: encoded,
        ...(args.branch ? { branch: args.branch } : {}),
        ...(args.sha ? { sha: args.sha } : {}),
      });

      return {
        success: true,
        data: {
          path: data.content?.path,
          sha: data.content?.sha,
          commit_sha: data.commit.sha,
          commit_url: data.commit.html_url,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
