/**
 * @fileoverview GitHub Release List tool — list releases for a repository.
 *
 * Returns tag name, release name, draft/prerelease status, publish date, and URL.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubReleaseListTool {
  readonly name = 'github_release_list';
  readonly description = 'List releases for a GitHub repository. Returns tag, name, draft/prerelease status, and publish date.';
  readonly category = 'developer';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      per_page: { type: 'number' as const, description: 'Results per page (max 30, default 10)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    per_page?: number;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.repos.listReleases({
        owner: args.owner,
        repo: args.repo,
        per_page: Math.min(args.per_page ?? 10, 30),
      });

      return {
        success: true,
        data: data.map((r: any) => ({
          tag: r.tag_name,
          name: r.name,
          draft: r.draft,
          prerelease: r.prerelease,
          publishedAt: r.published_at,
          url: r.html_url,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
