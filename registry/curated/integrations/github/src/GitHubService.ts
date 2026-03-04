/**
 * @fileoverview Octokit wrapper for the GitHub extension.
 * Manages token-based authentication and provides the Octokit client.
 */

import { Octokit } from '@octokit/rest';

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
}
