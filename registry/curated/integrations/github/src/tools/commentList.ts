// @ts-nocheck
/**
 * @fileoverview GitHub Comment List tool — list comments on an issue or pull request.
 *
 * Uses octokit.rest.issues.listComments, which works for both issues and PRs
 * since PRs are a superset of issues in the GitHub API.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubCommentListTool {
  readonly name = 'github_comment_list';
  readonly description = 'List comments on a GitHub issue or pull request. Returns comment id, author, body, timestamp, and URL.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'issue_number'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      issue_number: { type: 'number' as const, description: 'Issue or PR number' },
      per_page: { type: 'number' as const, description: 'Results per page (max 30, default 10)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    issue_number: number;
    per_page?: number;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.issues.listComments({
        owner: args.owner,
        repo: args.repo,
        issue_number: args.issue_number,
        per_page: Math.min(args.per_page ?? 10, 30),
      });

      return {
        success: true,
        data: data.map((c: any) => ({
          id: c.id,
          author: c.user?.login,
          body: c.body,
          createdAt: c.created_at,
          url: c.html_url,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
