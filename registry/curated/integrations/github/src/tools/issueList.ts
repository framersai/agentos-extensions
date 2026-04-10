// @ts-nocheck
/**
 * @fileoverview GitHub Issue List tool — list issues for a repository.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubIssueListTool {
  readonly name = 'github_issue_list';
  readonly description = 'List issues for a GitHub repository. Supports filtering by state and labels.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      state: {
        type: 'string' as const,
        enum: ['open', 'closed', 'all'] as const,
        description: 'Issue state filter (default: open)',
      },
      labels: { type: 'string' as const, description: 'Comma-separated label names to filter by' },
      per_page: { type: 'number' as const, description: 'Results per page (max 30, default 10)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    state?: string;
    labels?: string;
    per_page?: number;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.issues.listForRepo({
        owner: args.owner,
        repo: args.repo,
        state: (args.state as 'open' | 'closed' | 'all') ?? 'open',
        labels: args.labels,
        per_page: Math.min(args.per_page ?? 10, 30),
      });

      return {
        success: true,
        data: data
          .filter((i: any) => !i.pull_request) // Exclude PRs (GitHub API returns them too)
          .map((i: any) => ({
            number: i.number,
            title: i.title,
            state: i.state,
            author: i.user?.login,
            labels: i.labels.map((l: any) => (typeof l === 'string' ? l : l.name)),
            comments: i.comments,
            created_at: i.created_at,
            url: i.html_url,
          })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
