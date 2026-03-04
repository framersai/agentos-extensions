/**
 * @fileoverview GitHub PR Create tool — create a new pull request.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubPrCreateTool {
  readonly name = 'github_pr_create';
  readonly description = 'Create a new pull request in a GitHub repository.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'title', 'head', 'base'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      title: { type: 'string' as const, description: 'PR title' },
      head: { type: 'string' as const, description: 'Head branch name (source)' },
      base: { type: 'string' as const, description: 'Base branch name (target, e.g. "main")' },
      body: { type: 'string' as const, description: 'PR description (Markdown supported)' },
      draft: { type: 'boolean' as const, description: 'Create as draft PR (default: false)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
    draft?: boolean;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.pulls.create({
        owner: args.owner,
        repo: args.repo,
        title: args.title,
        head: args.head,
        base: args.base,
        body: args.body,
        draft: args.draft ?? false,
      });

      return {
        success: true,
        data: {
          number: data.number,
          title: data.title,
          url: data.html_url,
          state: data.state,
          draft: data.draft,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
