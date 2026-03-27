/**
 * @fileoverview GitHub PR Comment Create tool — add a top-level comment to a pull request.
 *
 * Uses octokit.rest.issues.createComment because in the GitHub API pull requests
 * are a superset of issues, and top-level PR comments are issue comments.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubPrCommentCreateTool {
  readonly name = 'github_pr_comment_create';
  readonly description = 'Add a top-level comment to a GitHub pull request. Uses the issues API since PRs are issues in GitHub.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'pull_number', 'body'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      pull_number: { type: 'number' as const, description: 'Pull request number' },
      body: { type: 'string' as const, description: 'Comment body (Markdown supported)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    pull_number: number;
    body: string;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.issues.createComment({
        owner: args.owner,
        repo: args.repo,
        issue_number: args.pull_number,
        body: args.body,
      });

      return {
        success: true,
        data: {
          id: data.id,
          url: data.html_url,
          body: data.body,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
