// @ts-nocheck
/**
 * @fileoverview GitHub PR Merge tool — merge a pull request.
 *
 * Supports merge, squash, and rebase strategies with optional custom
 * commit title and message.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubPrMergeTool {
  readonly name = 'github_pr_merge';
  readonly description = 'Merge a GitHub pull request. Supports merge, squash, and rebase methods.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'pull_number'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      pull_number: { type: 'number' as const, description: 'Pull request number' },
      merge_method: {
        type: 'string' as const,
        enum: ['merge', 'squash', 'rebase'] as const,
        description: 'Merge strategy (default: merge)',
      },
      commit_title: { type: 'string' as const, description: 'Custom merge commit title' },
      commit_message: { type: 'string' as const, description: 'Custom merge commit message body' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    pull_number: number;
    merge_method?: 'merge' | 'squash' | 'rebase';
    commit_title?: string;
    commit_message?: string;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.pulls.merge({
        owner: args.owner,
        repo: args.repo,
        pull_number: args.pull_number,
        merge_method: args.merge_method ?? 'merge',
        commit_title: args.commit_title,
        commit_message: args.commit_message,
      });

      return {
        success: true,
        data: {
          merged: data.merged,
          sha: data.sha,
          message: data.message,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
