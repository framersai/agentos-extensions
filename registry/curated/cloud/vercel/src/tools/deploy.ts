/**
 * @fileoverview VercelDeployTool — deploy a project to Vercel from a Git repository.
 */

import type { VercelService, DeployResult } from '../VercelService.js';

export interface VercelDeployInput {
  gitUrl: string;
  projectName?: string;
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  envVars?: Record<string, string>;
  target?: 'production' | 'preview';
}

export class VercelDeployTool {
  readonly id = 'vercelDeploy';
  readonly name = 'vercelDeploy';
  readonly displayName = 'Deploy to Vercel';
  readonly description = 'Deploy a project to Vercel from a Git repository URL. Creates the project if it does not exist. Supports Next.js, React, Vue, Svelte, static sites, and serverless functions with automatic framework detection.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      gitUrl: { type: 'string', description: 'Git repository URL (e.g. "https://github.com/user/repo")' },
      projectName: { type: 'string', description: 'Project name on Vercel (auto-generated from repo name if omitted)' },
      framework: { type: 'string', description: 'Framework preset (e.g. "nextjs", "vite", "gatsby"). Auto-detected if omitted.' },
      buildCommand: { type: 'string', description: 'Build command override (e.g. "npm run build")' },
      outputDirectory: { type: 'string', description: 'Output directory override (e.g. "dist", ".next", "build")' },
      envVars: { type: 'object', description: 'Environment variables to set on the project (key-value pairs)' },
      target: { type: 'string', enum: ['production', 'preview'], description: 'Deployment target (default: production)' },
    },
    required: ['gitUrl'],
  };

  constructor(private service: VercelService) {}

  async execute(args: VercelDeployInput): Promise<{ success: boolean; data?: DeployResult; error?: string }> {
    try {
      const result = await this.service.deployFromGit({
        gitUrl: args.gitUrl,
        projectName: args.projectName,
        framework: args.framework,
        buildCommand: args.buildCommand,
        outputDirectory: args.outputDirectory,
        envVars: args.envVars,
      });

      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
