// @ts-nocheck
/**
 * @fileoverview GitHub Repo Create tool — create a new repository for the authenticated user.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubRepoCreateTool {
  readonly name = 'github_repo_create';
  readonly description = 'Create a new GitHub repository for the authenticated user.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['name'] as const,
    properties: {
      name: { type: 'string' as const, description: 'Repository name' },
      description: { type: 'string' as const, description: 'Short description of the repository' },
      private: { type: 'boolean' as const, description: 'Whether the repo is private (default: false)' },
      auto_init: { type: 'boolean' as const, description: 'Initialize with a README (default: false)' },
      gitignore_template: { type: 'string' as const, description: 'Gitignore template name (e.g. "Node", "Python")' },
      license_template: { type: 'string' as const, description: 'License template (e.g. "mit", "apache-2.0")' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    name: string;
    description?: string;
    private?: boolean;
    auto_init?: boolean;
    gitignore_template?: string;
    license_template?: string;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const { data } = await octokit.rest.repos.createForAuthenticatedUser({
        name: args.name,
        description: args.description,
        private: args.private ?? false,
        auto_init: args.auto_init ?? false,
        gitignore_template: args.gitignore_template,
        license_template: args.license_template,
      });

      return {
        success: true,
        data: {
          name: data.name,
          full_name: data.full_name,
          url: data.html_url,
          clone_url: data.clone_url,
          private: data.private,
          default_branch: data.default_branch,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
