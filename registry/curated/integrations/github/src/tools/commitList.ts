// @ts-nocheck
/**
 * @fileoverview GitHub Commit List tool — list commits for a repository.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubCommitListTool {
  readonly name = 'github_commit_list';
  readonly description = 'List commits for a GitHub repository. Supports filtering by branch, path, author, and date range.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      sha: { type: 'string' as const, description: 'Branch name or commit SHA to list from (default: default branch)' },
      path: { type: 'string' as const, description: 'Only include commits touching this file path' },
      author: { type: 'string' as const, description: 'GitHub login or email to filter by author' },
      since: { type: 'string' as const, description: 'ISO 8601 date — only commits after this date' },
      until: { type: 'string' as const, description: 'ISO 8601 date — only commits before this date' },
      per_page: { type: 'number' as const, description: 'Results per page (max 100, default 30)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    sha?: string;
    path?: string;
    author?: string;
    since?: string;
    until?: string;
    per_page?: number;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.repos.listCommits({
        owner: args.owner,
        repo: args.repo,
        sha: args.sha,
        path: args.path,
        author: args.author,
        since: args.since,
        until: args.until,
        per_page: Math.min(args.per_page ?? 30, 100),
      });

      return {
        success: true,
        data: data.map((c: any) => ({
          sha: c.sha,
          message: c.commit.message,
          author: c.commit.author?.name,
          author_login: c.author?.login,
          date: c.commit.author?.date,
          url: c.html_url,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
