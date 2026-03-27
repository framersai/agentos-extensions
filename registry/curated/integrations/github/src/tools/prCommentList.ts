/**
 * @fileoverview GitHub PR Comment List tool — list review comments on a pull request.
 *
 * Unlike issue comments (which are top-level), review comments are attached to
 * specific file paths and diff lines. Uses octokit.rest.pulls.listReviewComments.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubPrCommentListTool {
  readonly name = 'github_pr_comment_list';
  readonly description = 'List review comments on a GitHub pull request. Returns inline comments with file path, line, author, and body.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'pull_number'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      pull_number: { type: 'number' as const, description: 'Pull request number' },
      per_page: { type: 'number' as const, description: 'Results per page (max 30, default 10)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    pull_number: number;
    per_page?: number;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.pulls.listReviewComments({
        owner: args.owner,
        repo: args.repo,
        pull_number: args.pull_number,
        per_page: Math.min(args.per_page ?? 10, 30),
      });

      return {
        success: true,
        data: data.map((c: any) => ({
          id: c.id,
          author: c.user?.login,
          body: c.body,
          path: c.path,
          line: c.line,
          createdAt: c.created_at,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
