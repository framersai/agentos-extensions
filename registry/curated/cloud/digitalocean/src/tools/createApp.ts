/**
 * @fileoverview DOCreateAppTool — create an App Platform app from a Git repository.
 */

import type { DigitalOceanService, DOApp } from '../DigitalOceanService.js';

export interface CreateAppInput {
  name: string;
  gitUrl: string;
  branch?: string;
  region?: string;
  buildCommand?: string;
  runCommand?: string;
  outputDir?: string;
  isStatic?: boolean;
  envVars?: Record<string, string>;
  instanceSizeSlug?: string;
}

export class DOCreateAppTool {
  readonly id = 'doCreateApp';
  readonly name = 'doCreateApp';
  readonly displayName = 'Create DO App';
  readonly description = 'Create a DigitalOcean App Platform app from a Git repository with auto-detected settings. Supports both services (Node.js, Python, Go, etc.) and static sites. Configures build/run commands, environment variables, region, and instance size.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'App name (must be lowercase, alphanumeric, and hyphens only)' },
      gitUrl: { type: 'string', description: 'Git repository clone URL (e.g. "https://github.com/user/repo")' },
      branch: { type: 'string', description: 'Git branch to deploy from (default: "main")' },
      region: { type: 'string', description: 'Region slug (e.g. "nyc", "sfo", "ams", "sgp"). Default: "nyc"' },
      buildCommand: { type: 'string', description: 'Build command override (e.g. "npm run build")' },
      runCommand: { type: 'string', description: 'Run command for services (e.g. "npm start")' },
      outputDir: { type: 'string', description: 'Output directory for static sites (e.g. "dist", "build")' },
      isStatic: { type: 'boolean', description: 'Whether to deploy as a static site (default: false, deploys as service)' },
      envVars: { type: 'object', description: 'Environment variables as key-value pairs' },
      instanceSizeSlug: { type: 'string', description: 'Instance size slug (e.g. "basic-xxs", "basic-xs", "professional-xs")' },
    },
    required: ['name', 'gitUrl'],
  };

  constructor(private service: DigitalOceanService) {}

  async execute(args: CreateAppInput): Promise<{ success: boolean; data?: DOApp; error?: string }> {
    try {
      const app = await this.service.createApp({
        name: args.name,
        gitUrl: args.gitUrl,
        branch: args.branch,
        region: args.region,
        buildCommand: args.buildCommand,
        runCommand: args.runCommand,
        outputDir: args.outputDir,
        isStatic: args.isStatic,
        envVars: args.envVars,
        instanceSizeSlug: args.instanceSizeSlug,
      });

      return { success: true, data: app };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
