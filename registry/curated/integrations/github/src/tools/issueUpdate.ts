/**
 * @fileoverview GitHub Issue Update tool — update an existing issue.
 *
 * Supports partial updates: only fields that are provided will be modified.
 * Can change title, body, state, labels, and assignees.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubIssueUpdateTool {
  readonly name = 'github_issue_update';
  readonly description = 'Update an existing GitHub issue. Only provided fields are modified — omit fields to leave them unchanged.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'issue_number'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      issue_number: { type: 'number' as const, description: 'Issue number to update' },
      title: { type: 'string' as const, description: 'New issue title' },
      body: { type: 'string' as const, description: 'New issue body (Markdown supported)' },
      state: {
        type: 'string' as const,
        enum: ['open', 'closed'] as const,
        description: 'Set issue state',
      },
      labels: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Replace labels (full set, not additive)',
      },
      assignees: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Replace assignees (full set, not additive)',
      },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    issue_number: number;
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
    assignees?: string[];
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();

      /** Build the update payload — only include fields the caller provided. */
      const updateParams: Record<string, unknown> = {
        owner: args.owner,
        repo: args.repo,
        issue_number: args.issue_number,
      };
      if (args.title !== undefined) updateParams.title = args.title;
      if (args.body !== undefined) updateParams.body = args.body;
      if (args.state !== undefined) updateParams.state = args.state;
      if (args.labels !== undefined) updateParams.labels = args.labels;
      if (args.assignees !== undefined) updateParams.assignees = args.assignees;

      const { data } = await octokit.rest.issues.update(updateParams as any);

      return {
        success: true,
        data: {
          number: data.number,
          title: data.title,
          state: data.state,
          labels: data.labels.map((l: any) => (typeof l === 'string' ? l : l.name)),
          assignees: data.assignees?.map((a: any) => a.login) ?? [],
          url: data.html_url,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
