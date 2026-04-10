// @ts-nocheck
/**
 * @fileoverview GitHub Repo Info tool — get detailed metadata for a single repository.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubRepoInfoTool {
  readonly name = 'github_repo_info';
  readonly description = 'Get detailed metadata for a GitHub repository including stars, forks, topics, license, and default branch.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.repos.get({
        owner: args.owner,
        repo: args.repo,
      });

      return {
        success: true,
        data: {
          name: data.name,
          full_name: data.full_name,
          description: data.description,
          language: data.language,
          stars: data.stargazers_count,
          forks: data.forks_count,
          open_issues: data.open_issues_count,
          topics: data.topics ?? [],
          default_branch: data.default_branch,
          visibility: data.visibility ?? 'public',
          license: data.license?.spdx_id ?? null,
          created_at: data.created_at,
          updated_at: data.updated_at,
          pushed_at: data.pushed_at,
          size: data.size,
          url: data.html_url,
          clone_url: data.clone_url,
          has_issues: data.has_issues,
          has_wiki: data.has_wiki,
          archived: data.archived,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
