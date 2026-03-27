/**
 * @fileoverview GitHub Actions List tool — list workflow runs for a repository.
 *
 * When workflow_id is provided, lists runs for that specific workflow.
 * Otherwise, lists all workflow runs for the repository.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubActionsListTool {
  readonly name = 'github_actions_list';
  readonly description = 'List GitHub Actions workflow runs. Optionally filter by a specific workflow ID.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      workflow_id: {
        type: 'string' as const,
        description: 'Workflow ID or filename (e.g. "ci.yml") to filter by',
      },
      per_page: { type: 'number' as const, description: 'Results per page (max 30, default 10)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    workflow_id?: string;
    per_page?: number;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const perPage = Math.min(args.per_page ?? 10, 30);

      let runs: any[];

      if (args.workflow_id) {
        const { data } = await octokit.rest.actions.listWorkflowRuns({
          owner: args.owner,
          repo: args.repo,
          workflow_id: args.workflow_id,
          per_page: perPage,
        });
        runs = data.workflow_runs;
      } else {
        const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
          owner: args.owner,
          repo: args.repo,
          per_page: perPage,
        });
        runs = data.workflow_runs;
      }

      return {
        success: true,
        data: runs.map((r: any) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          branch: r.head_branch,
          event: r.event,
          createdAt: r.created_at,
          url: r.html_url,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
