/**
 * @fileoverview GitHub PR List tool — list pull requests for a repository.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubPrListTool {
  readonly name = 'github_pr_list';
  readonly description = 'List pull requests for a GitHub repository. Supports filtering by state, head, and base branch.';
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
        description: 'PR state filter (default: open)',
      },
      head: { type: 'string' as const, description: 'Filter by head branch (user:branch format)' },
      base: { type: 'string' as const, description: 'Filter by base branch' },
      per_page: { type: 'number' as const, description: 'Results per page (max 30, default 10)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    state?: string;
    head?: string;
    base?: string;
    per_page?: number;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.pulls.list({
        owner: args.owner,
        repo: args.repo,
        state: (args.state as 'open' | 'closed' | 'all') ?? 'open',
        head: args.head,
        base: args.base,
        per_page: Math.min(args.per_page ?? 10, 30),
      });

      return {
        success: true,
        data: data.map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          draft: pr.draft,
          author: pr.user?.login,
          head: pr.head.ref,
          base: pr.base.ref,
          created_at: pr.created_at,
          url: pr.html_url,
          mergeable_state: pr.mergeable_state,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
