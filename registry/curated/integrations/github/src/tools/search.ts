// @ts-nocheck
/**
 * @fileoverview GitHub Search tool — search repos, code, issues, or users.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubSearchTool {
  readonly name = 'github_search';
  readonly description = 'Search GitHub repositories, code, issues, or users. Returns top results with key metadata.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['query'] as const,
    properties: {
      query: { type: 'string' as const, description: 'Search query (GitHub search syntax supported)' },
      type: {
        type: 'string' as const,
        enum: ['repositories', 'code', 'issues', 'users'] as const,
        description: 'Search type (default: repositories)',
      },
      per_page: { type: 'number' as const, description: 'Results per page (max 30, default 10)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: { query: string; type?: string; per_page?: number }): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> {
    try {
      const octokit = this.service.getOctokit();
      const perPage = Math.min(args.per_page ?? 10, 30);
      const searchType = args.type ?? 'repositories';

      if (searchType === 'repositories') {
        const { data } = await octokit.rest.search.repos({ q: args.query, per_page: perPage });
        return {
          success: true,
          data: {
            total_count: data.total_count,
            items: data.items.map((r: any) => ({
              full_name: r.full_name,
              description: r.description,
              stars: r.stargazers_count,
              language: r.language,
              url: r.html_url,
              updated_at: r.updated_at,
            })),
          },
        };
      }

      if (searchType === 'code') {
        const { data } = await octokit.rest.search.code({ q: args.query, per_page: perPage });
        return {
          success: true,
          data: {
            total_count: data.total_count,
            items: data.items.map((c: any) => ({
              name: c.name,
              path: c.path,
              repository: c.repository.full_name,
              url: c.html_url,
            })),
          },
        };
      }

      if (searchType === 'issues') {
        const { data } = await octokit.rest.search.issuesAndPullRequests({ q: args.query, per_page: perPage });
        return {
          success: true,
          data: {
            total_count: data.total_count,
            items: data.items.map((i: any) => ({
              title: i.title,
              number: i.number,
              state: i.state,
              repository_url: i.repository_url,
              url: i.html_url,
              created_at: i.created_at,
              labels: i.labels.map((l: any) => (typeof l === 'string' ? l : l.name)),
            })),
          },
        };
      }

      if (searchType === 'users') {
        const { data } = await octokit.rest.search.users({ q: args.query, per_page: perPage });
        return {
          success: true,
          data: {
            total_count: data.total_count,
            items: data.items.map((u: any) => ({
              login: u.login,
              type: u.type,
              url: u.html_url,
            })),
          },
        };
      }

      return { success: false, error: `Unknown search type: ${searchType}` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
