/**
 * @fileoverview GitHub Extension for AgentOS.
 *
 * Provides GitHub API tools for searching, managing issues/PRs,
 * reading files, and creating gists.
 *
 * @module @framers/agentos-ext-github
 */

import { execSync } from 'node:child_process';
import { GitHubService } from './GitHubService.js';
import { GitHubSearchTool } from './tools/search.js';
import { GitHubIssueListTool } from './tools/issueList.js';
import { GitHubIssueCreateTool } from './tools/issueCreate.js';
import { GitHubPrListTool } from './tools/prList.js';
import { GitHubPrCreateTool } from './tools/prCreate.js';
import { GitHubFileReadTool } from './tools/fileRead.js';
import { GitHubGistCreateTool } from './tools/gistCreate.js';

export interface GitHubExtensionOptions {
  token?: string;
  priority?: number;
}

function resolveToken(
  options: GitHubExtensionOptions,
  secrets?: Record<string, string>,
): string {
  if (options.token) return options.token;
  if (secrets?.['github.token']) return secrets['github.token'];
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;

  // Fallback: try gh CLI auth
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (token) return token;
  } catch {
    // gh not installed or not authenticated
  }

  throw new Error(
    'GitHub token not found. Provide via options.token, secrets["github.token"], ' +
    'GITHUB_TOKEN env var, or authenticate with `gh auth login`.',
  );
}

export function createExtensionPack(context: {
  options?: Record<string, unknown>;
  secrets?: Record<string, string>;
  logger?: { info: (...args: unknown[]) => void };
  [key: string]: unknown;
}) {
  const options = (context.options ?? {}) as GitHubExtensionOptions & {
    secrets?: Record<string, string>;
  };
  const token = resolveToken(options, options.secrets ?? context.secrets);
  const service = new GitHubService(token);
  const priority = options.priority ?? 30;

  const tools = [
    new GitHubSearchTool(service),
    new GitHubIssueListTool(service),
    new GitHubIssueCreateTool(service),
    new GitHubPrListTool(service),
    new GitHubPrCreateTool(service),
    new GitHubFileReadTool(service),
    new GitHubGistCreateTool(service),
  ];

  return {
    name: '@framers/agentos-ext-github',
    version: '0.1.0',
    descriptors: tools.map((tool) => ({
      id: tool.name,
      kind: 'tool' as const,
      priority,
      payload: tool,
    })),

    onActivate: async () => {
      await service.initialize();
      context.logger?.info(`[GitHub] Extension activated (user: ${service.getUsername()})`);
    },

    onDeactivate: async () => {
      context.logger?.info('[GitHub] Extension deactivated');
    },
  };
}

export { GitHubService } from './GitHubService.js';
export { GitHubSearchTool } from './tools/search.js';
export { GitHubIssueListTool } from './tools/issueList.js';
export { GitHubIssueCreateTool } from './tools/issueCreate.js';
export { GitHubPrListTool } from './tools/prList.js';
export { GitHubPrCreateTool } from './tools/prCreate.js';
export { GitHubFileReadTool } from './tools/fileRead.js';
export { GitHubGistCreateTool } from './tools/gistCreate.js';
export default createExtensionPack;
