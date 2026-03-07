/**
 * @fileoverview HerokuDeployAppTool — deploy a Heroku app from a source tarball URL.
 */

import type { HerokuService, HerokuBuild } from '../HerokuService.js';

export interface HerokuDeployAppInput {
  appName: string;
  sourceUrl: string;
  version?: string;
  configVars?: Record<string, string>;
}

export class HerokuDeployAppTool {
  readonly id = 'herokuDeployApp';
  readonly name = 'herokuDeployApp';
  readonly displayName = 'Deploy Heroku App';
  readonly description = 'Deploy a Heroku app from a source tarball URL. The tarball should contain the application source code. Optionally update config vars before deploying.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      appName: { type: 'string', description: 'Name of the Heroku app to deploy to' },
      sourceUrl: { type: 'string', description: 'URL of the source tarball (.tar.gz) to deploy' },
      version: { type: 'string', description: 'Optional version label for the build (e.g. git SHA or semver tag)' },
      configVars: { type: 'object', description: 'Config variables to set before deploying (key-value pairs)' },
    },
    required: ['appName', 'sourceUrl'],
  };

  constructor(private service: HerokuService) {}

  async execute(args: HerokuDeployAppInput): Promise<{ success: boolean; data?: HerokuBuild; error?: string }> {
    try {
      // Update config vars if provided
      if (args.configVars && Object.keys(args.configVars).length > 0) {
        await this.service.updateConfigVars(args.appName, args.configVars);
      }

      const build = await this.service.createBuild(
        args.appName,
        args.sourceUrl,
        args.version,
      );

      return { success: true, data: build };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
