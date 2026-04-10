// @ts-nocheck
/**
 * @fileoverview GitHub PR Diff tool — get files changed in a pull request.
 *
 * Returns a summary of changed files with optional patch content.
 * Patch text is truncated to 3000 characters per file to keep token usage manageable.
 */

import type { GitHubService } from '../GitHubService.js';

/** Maximum characters to include per-file patch. */
const MAX_PATCH_LENGTH = 3000;

export class GitHubPrDiffTool {
  readonly name = 'github_pr_diff';
  readonly description = 'Get files changed in a GitHub pull request. Returns filename, status, additions, deletions, and optional patch.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'pull_number'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      pull_number: { type: 'number' as const, description: 'Pull request number' },
      include_patch: {
        type: 'boolean' as const,
        description: 'Include patch/diff text per file (default: false). Patches are truncated to 3000 chars.',
      },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    pull_number: number;
    include_patch?: boolean;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.pulls.listFiles({
        owner: args.owner,
        repo: args.repo,
        pull_number: args.pull_number,
      });

      let totalAdditions = 0;
      let totalDeletions = 0;

      const files = data.map((f: any) => {
        totalAdditions += f.additions;
        totalDeletions += f.deletions;

        const entry: Record<string, unknown> = {
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes,
        };

        if (args.include_patch && f.patch) {
          entry.patch =
            f.patch.length > MAX_PATCH_LENGTH
              ? f.patch.slice(0, MAX_PATCH_LENGTH) + '\n... (truncated)'
              : f.patch;
        }

        return entry;
      });

      return {
        success: true,
        data: {
          totalFiles: files.length,
          totalAdditions,
          totalDeletions,
          files,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
