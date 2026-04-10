// @ts-nocheck
/**
 * @fileoverview GitHub Repo List tool — list repositories for a user or organisation.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubRepoListTool {
  readonly name = 'github_repo_list';
  readonly description = 'List repositories for a GitHub user or organisation. Returns name, description, stars, and language for each repo.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['username'] as const,
    properties: {
      username: { type: 'string' as const, description: 'GitHub username or organisation name' },
      type: {
        type: 'string' as const,
        enum: ['user', 'org'] as const,
        description: 'Account type — "user" (default) or "org"',
      },
      sort: {
        type: 'string' as const,
        enum: ['created', 'updated', 'pushed', 'full_name'] as const,
        description: 'Sort field (default: updated)',
      },
      per_page: { type: 'number' as const, description: 'Results per page (max 100, default 30)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    username: string;
    type?: string;
    sort?: string;
    per_page?: number;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const perPage = Math.min(args.per_page ?? 30, 100);
      const sort = (args.sort as 'created' | 'updated' | 'pushed' | 'full_name') ?? 'updated';

      let repos: any[];

      if (args.type === 'org') {
        const { data } = await octokit.rest.repos.listForOrg({
          org: args.username,
          sort,
          per_page: perPage,
        });
        repos = data;
      } else {
        const { data } = await octokit.rest.repos.listForUser({
          username: args.username,
          sort,
          per_page: perPage,
        });
        repos = data;
      }

      return {
        success: true,
        data: repos.map((r: any) => ({
          name: r.name,
          full_name: r.full_name,
          description: r.description,
          language: r.language,
          stars: r.stargazers_count,
          forks: r.forks_count,
          visibility: r.visibility ?? (r.private ? 'private' : 'public'),
          updated_at: r.updated_at,
          url: r.html_url,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
