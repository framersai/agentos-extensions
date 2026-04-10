// @ts-nocheck
/**
 * @fileoverview NetlifyDeployTool — deploy a site to Netlify from a Git repository.
 */

import type { NetlifyService, DeployResult } from '../NetlifyService.js';

export interface NetlifyDeployInput {
  gitUrl: string;
  siteName?: string;
  buildCommand?: string;
  publishDirectory?: string;
  branch?: string;
  envVars?: Record<string, string>;
}

export class NetlifyDeployTool {
  readonly id = 'netlifyDeploySite';
  readonly name = 'netlifyDeploySite';
  readonly displayName = 'Deploy to Netlify';
  readonly description = 'Deploy a site to Netlify from a Git repository URL. Creates the site if it does not exist. Supports static sites, Next.js, Gatsby, Hugo, and other Jamstack frameworks with automatic continuous deployment.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      gitUrl: { type: 'string', description: 'Git repository URL (e.g. "https://github.com/user/repo")' },
      siteName: { type: 'string', description: 'Site name on Netlify (auto-generated from repo name if omitted). Must be globally unique.' },
      buildCommand: { type: 'string', description: 'Build command (e.g. "npm run build", "hugo", "gatsby build")' },
      publishDirectory: { type: 'string', description: 'Publish directory (e.g. "dist", "build", "public", ".next")' },
      branch: { type: 'string', description: 'Git branch to deploy from (default: "main")' },
      envVars: { type: 'object', description: 'Environment variables to set on the site (key-value pairs)' },
    },
    required: ['gitUrl'],
  };

  constructor(private service: NetlifyService) {}

  async execute(args: NetlifyDeployInput): Promise<{ success: boolean; data?: DeployResult; error?: string }> {
    try {
      const result = await this.service.deployFromGit({
        gitUrl: args.gitUrl,
        siteName: args.siteName,
        buildCommand: args.buildCommand,
        publishDirectory: args.publishDirectory,
        branch: args.branch,
        envVars: args.envVars,
      });

      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
