// @ts-nocheck
/**
 * @fileoverview GitHub Release Create tool — create a new release.
 *
 * Supports creating draft and prerelease releases, targeting a specific
 * commitish, and auto-generating release notes from commits.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubReleaseCreateTool {
  readonly name = 'github_release_create';
  readonly description = 'Create a new GitHub release. Supports draft, prerelease, and auto-generated release notes.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['owner', 'repo', 'tag_name'] as const,
    properties: {
      owner: { type: 'string' as const, description: 'Repository owner (user or org)' },
      repo: { type: 'string' as const, description: 'Repository name' },
      tag_name: { type: 'string' as const, description: 'Tag name for the release (e.g. "v1.0.0")' },
      name: { type: 'string' as const, description: 'Release title' },
      body: { type: 'string' as const, description: 'Release notes body (Markdown supported)' },
      draft: { type: 'boolean' as const, description: 'Create as draft release (default: false)' },
      prerelease: { type: 'boolean' as const, description: 'Mark as prerelease (default: false)' },
      target_commitish: {
        type: 'string' as const,
        description: 'Branch or commit SHA to tag (default: default branch)',
      },
      generate_release_notes: {
        type: 'boolean' as const,
        description: 'Auto-generate release notes from commits (default: false)',
      },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    owner: string;
    repo: string;
    tag_name: string;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    target_commitish?: string;
    generate_release_notes?: boolean;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.repos.createRelease({
        owner: args.owner,
        repo: args.repo,
        tag_name: args.tag_name,
        name: args.name,
        body: args.body,
        draft: args.draft ?? false,
        prerelease: args.prerelease ?? false,
        target_commitish: args.target_commitish,
        generate_release_notes: args.generate_release_notes ?? false,
      });

      return {
        success: true,
        data: {
          id: data.id,
          tag: data.tag_name,
          name: data.name,
          draft: data.draft,
          prerelease: data.prerelease,
          url: data.html_url,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
