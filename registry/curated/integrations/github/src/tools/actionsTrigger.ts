/**
 * @fileoverview GitHub Actions Trigger tool — trigger a workflow dispatch event.
 *
 * Dispatches a workflow_dispatch event to a specific workflow, targeting a branch
 * or tag ref. Supports passing custom input key-value pairs.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubActionsTriggerTool {
  readonly name = 'github_actions_trigger';
  readonly description = 'Trigger a GitHub Actions workflow via workflow_dispatch. Supports custom inputs and target ref.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'workflow_id'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      workflow_id: {
        type: 'string' as const,
        description: 'Workflow ID or filename (e.g. "deploy.yml")',
      },
      ref: {
        type: 'string' as const,
        description: 'Git ref to run the workflow on (default: "master")',
      },
      inputs: {
        type: 'object' as const,
        description: 'Key-value input parameters for the workflow',
        additionalProperties: { type: 'string' as const },
      },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    workflow_id: string;
    ref?: string;
    inputs?: Record<string, string>;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      await octokit.rest.actions.createWorkflowDispatch({
        owner: args.owner,
        repo: args.repo,
        workflow_id: args.workflow_id,
        ref: args.ref ?? 'master',
        inputs: args.inputs,
      });

      return {
        success: true,
        data: {
          workflow_id: args.workflow_id,
          ref: args.ref ?? 'master',
          message: 'Workflow dispatch event triggered successfully',
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
