// @ts-nocheck
/**
 * @fileoverview GitHub Issue Create tool — create a new issue.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubIssueCreateTool {
  readonly name = 'github_issue_create';
  readonly description = 'Create a new issue in a GitHub repository.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'title'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      title: { type: 'string' as const, description: 'Issue title' },
      body: { type: 'string' as const, description: 'Issue body (Markdown supported)' },
      labels: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Labels to apply',
      },
      assignees: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'GitHub usernames to assign',
      },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.issues.create({
        owner: args.owner,
        repo: args.repo,
        title: args.title,
        body: args.body,
        labels: args.labels,
        assignees: args.assignees,
      });

      return {
        success: true,
        data: {
          number: data.number,
          title: data.title,
          url: data.html_url,
          state: data.state,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
