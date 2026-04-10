// @ts-nocheck
/**
 * @fileoverview GitHub Branch Create tool — create a new branch from an existing
 * branch or SHA. Resolves the source branch name to a commit SHA before creating
 * the Git ref.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubBranchCreateTool {
  readonly name = 'github_branch_create';
  readonly description = 'Create a new branch in a GitHub repository. Resolves the source branch to its HEAD SHA automatically.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'branch'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      branch: { type: 'string' as const, description: 'New branch name to create' },
      from: { type: 'string' as const, description: 'Source branch name or commit SHA to branch from (default: repo default branch)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    branch: string;
    from?: string;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();

      // Resolve source to a SHA — if "from" looks like a 40-char hex string, use it
      // directly; otherwise treat it as a branch name and look up the HEAD commit.
      let sha: string;
      const source = args.from;

      if (source && /^[0-9a-f]{40}$/i.test(source)) {
        sha = source;
      } else {
        // If no source specified, use the default branch
        const branchName = source
          ?? (await octokit.rest.repos.get({ owner: args.owner, repo: args.repo }))
              .data.default_branch;

        const { data: refData } = await octokit.rest.git.getRef({
          owner: args.owner,
          repo: args.repo,
          ref: `heads/${branchName}`,
        });
        sha = refData.object.sha;
      }

      const { data } = await octokit.rest.git.createRef({
        owner: args.owner,
        repo: args.repo,
        ref: `refs/heads/${args.branch}`,
        sha,
      });

      return {
        success: true,
        data: {
          ref: data.ref,
          sha: data.object.sha,
          url: data.url,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
