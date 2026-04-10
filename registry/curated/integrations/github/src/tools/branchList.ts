// @ts-nocheck
/**
 * @fileoverview GitHub Branch List tool — list branches for a repository.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubBranchListTool {
  readonly name = 'github_branch_list';
  readonly description = 'List branches for a GitHub repository. Returns branch name, commit SHA, and protection status.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      protected: { type: 'boolean' as const, description: 'Filter to only protected branches' },
      per_page: { type: 'number' as const, description: 'Results per page (max 100, default 30)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    protected?: boolean;
    per_page?: number;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.repos.listBranches({
        owner: args.owner,
        repo: args.repo,
        protected: args.protected,
        per_page: Math.min(args.per_page ?? 30, 100),
      });

      return {
        success: true,
        data: data.map((b: any) => ({
          name: b.name,
          sha: b.commit.sha,
          protected: b.protected,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
