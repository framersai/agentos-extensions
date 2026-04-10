// @ts-nocheck
/**
 * @fileoverview DODeployAppTool — trigger a new deployment on an existing App Platform app.
 */

import type { DigitalOceanService, DODeployment } from '../DigitalOceanService.js';

export interface DeployAppInput {
  appId: string;
  forceBuild?: boolean;
}

export class DODeployAppTool {
  readonly id = 'doDeployApp';
  readonly name = 'doDeployApp';
  readonly displayName = 'Deploy DO App';
  readonly description = 'Trigger a new deployment on an existing DigitalOcean App Platform app. Pulls the latest code from the configured Git repository and builds/deploys it. Optionally force a full rebuild.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      appId: { type: 'string', description: 'App ID to deploy (use doListResources to find app IDs)' },
      forceBuild: { type: 'boolean', description: 'Force a complete rebuild instead of incremental (default: false)' },
    },
    required: ['appId'],
  };

  constructor(private service: DigitalOceanService) {}

  async execute(args: DeployAppInput): Promise<{ success: boolean; data?: DODeployment; error?: string }> {
    try {
      const deployment = await this.service.createDeployment(args.appId, args.forceBuild);
      return { success: true, data: deployment };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
