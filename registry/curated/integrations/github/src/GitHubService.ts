// @ts-nocheck
/**
 * @fileoverview Octokit wrapper for the GitHub extension.
 * Manages token-based authentication and provides the Octokit client
 * along with convenience methods for common GitHub API operations.
 */

import { Octokit } from '@octokit/rest';

/** A single entry from a Git tree (file, directory, or submodule). */
export interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

/** Rate-limit snapshot returned by {@link GitHubService.getRateLimit}. */
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetsAt: string;
}

/** High-level repository metadata returned by {@link GitHubService.getRepoMetadata}. */
export interface RepoMetadata {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  topics: string[];
  defaultBranch: string;
  visibility: string;
  license: string | null;
  pushedAt: string | null;
  htmlUrl: string;
}

export class GitHubService {
  private octokit: Octokit | null = null;
  private readonly token: string;
  private username = '';

  constructor(token: string) {
    this.token = token;
  }

  async initialize(): Promise<void> {
    this.octokit = new Octokit({ auth: this.token });
    // Validate token with a lightweight call
    const { data } = await this.octokit.rest.users.getAuthenticated();
    this.username = data.login;
  }

  getOctokit(): Octokit {
    if (!this.octokit) throw new Error('GitHubService not initialized');
    return this.octokit;
  }

  getUsername(): string {
    return this.username;
  }

  /**
   * Retrieve the full recursive tree for a repo at a given ref.
   * @param owner - Repository owner (user or org).
   * @param repo  - Repository name.
   * @param sha   - Branch name, tag, or commit SHA (default: 'HEAD').
   * @returns Flat array of tree entries with path, type, and optional size.
   */
  async getRepoTree(owner: string, repo: string, sha = 'HEAD'): Promise<TreeEntry[]> {
    const octokit = this.getOctokit();
    const { data } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: sha,
      recursive: 'true',
    });
    return (data.tree as any[]).map((entry) => ({
      path: entry.path!,
      type: entry.type!,
      ...(entry.size != null ? { size: entry.size } : {}),
    }));
  }

  /**
   * Read and decode a single file from a repository.
   * @param owner - Repository owner.
   * @param repo  - Repository name.
   * @param path  - File path within the repo.
   * @param ref   - Optional branch, tag, or SHA.
   * @returns Decoded UTF-8 file content as a string.
   */
  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    const octokit = this.getOctokit();
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ...(ref ? { ref } : {}),
    });

    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
      throw new Error(`Path "${path}" is not a file`);
    }

    return Buffer.from(data.content, 'base64').toString('utf8');
  }

  /**
   * Return current API rate-limit status for the authenticated token.
   * @returns Object with remaining calls, total limit, and UTC reset timestamp.
   */
  async getRateLimit(): Promise<RateLimitInfo> {
    const octokit = this.getOctokit();
    const { data } = await octokit.rest.rateLimit.get();
    const core = data.resources.core;
    return {
      remaining: core.remaining,
      limit: core.limit,
      resetsAt: new Date(core.reset * 1000).toISOString(),
    };
  }

  /**
   * Fetch high-level metadata for a repository.
   * @param owner - Repository owner.
   * @param repo  - Repository name.
   * @returns Normalized metadata object.
   */
  async getRepoMetadata(owner: string, repo: string): Promise<RepoMetadata> {
    const octokit = this.getOctokit();
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return {
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      language: data.language,
      stars: data.stargazers_count,
      forks: data.forks_count,
      topics: data.topics ?? [],
      defaultBranch: data.default_branch,
      visibility: data.visibility ?? 'public',
      license: data.license?.spdx_id ?? null,
      pushedAt: data.pushed_at,
      htmlUrl: data.html_url,
    };
  }
}
