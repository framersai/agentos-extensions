/**
 * @fileoverview GitHub Gist Create tool — create a new gist.
 */

import type { GitHubService } from '../GitHubService.js';

export class GitHubGistCreateTool {
  readonly name = 'github_gist_create';
  readonly description = 'Create a new GitHub gist with one or more files.';
  readonly category = 'developer';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    required: ['files'] as const,
    properties: {
      description: { type: 'string' as const, description: 'Gist description' },
      files: {
        type: 'object' as const,
        description: 'Map of filename to content. Example: {"main.py": "print(\'hello\')"}',
        additionalProperties: { type: 'string' as const },
      },
      public: { type: 'boolean' as const, description: 'Whether the gist is public (default: false)' },
    },
  };

  constructor(private readonly service: GitHubService) {}

  async execute(args: {
    description?: string;
    files: Record<string, string>;
    public?: boolean;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const octokit = this.service.getOctokit();
      const gistFiles: Record<string, { content: string }> = {};
      for (const [name, content] of Object.entries(args.files)) {
        gistFiles[name] = { content };
      }

      const { data } = await octokit.rest.gists.create({
        description: args.description ?? '',
        public: args.public ?? false,
        files: gistFiles,
      });

      return {
        success: true,
        data: {
          id: data.id,
          url: data.html_url,
          files: Object.keys(data.files ?? {}),
          public: data.public,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
