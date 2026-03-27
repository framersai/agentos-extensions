/**
 * @fileoverview GitHub PR Review tool — create a review on a pull request.
 *
 * Supports APPROVE, COMMENT, and REQUEST_CHANGES events, with optional
 * inline review comments targeting specific file paths and lines.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubPrReviewTool {
  readonly name = 'github_pr_review';
  readonly description = 'Create a review on a GitHub pull request (approve, comment, or request changes). Supports inline comments.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'pull_number', 'event'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      pull_number: { type: 'number' as const, description: 'Pull request number' },
      event: {
        type: 'string' as const,
        enum: ['APPROVE', 'COMMENT', 'REQUEST_CHANGES'] as const,
        description: 'Review action: APPROVE, COMMENT, or REQUEST_CHANGES',
      },
      body: { type: 'string' as const, description: 'Review body/summary (required for REQUEST_CHANGES)' },
      comments: {
        type: 'array' as const,
        description: 'Inline review comments',
        items: {
          type: 'object' as const,
          required: ['path', 'line', 'body'] as const,
          properties: {
            path: { type: 'string' as const, description: 'File path relative to repo root' },
            line: { type: 'number' as const, description: 'Line number in the diff to comment on' },
            body: { type: 'string' as const, description: 'Comment body' },
          },
        },
      },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    pull_number: number;
    event: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';
    body?: string;
    comments?: Array<{ path: string; line: number; body: string }>;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.pulls.createReview({
        owner: args.owner,
        repo: args.repo,
        pull_number: args.pull_number,
        event: args.event,
        body: args.body,
        comments: args.comments,
      });

      return {
        success: true,
        data: {
          id: data.id,
          state: data.state,
          url: data.html_url,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
