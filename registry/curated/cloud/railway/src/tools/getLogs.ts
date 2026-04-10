// @ts-nocheck
/**
 * @fileoverview RailwayGetLogsTool — retrieve deployment or build logs from Railway.
 */

import type { RailwayService, RailwayLogEntry } from '../RailwayService.js';

export interface RailwayGetLogsInput {
  deploymentId: string;
  type?: 'deploy' | 'build';
}

export class RailwayGetLogsTool {
  readonly id = 'railwayGetLogs';
  readonly name = 'railwayGetLogs';
  readonly displayName = 'Get Railway Logs';
  readonly description = 'Retrieve logs for a Railway deployment. Can fetch either deployment (runtime) logs or build logs. Returns timestamped log entries with severity levels.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      deploymentId: { type: 'string', description: 'Deployment ID to retrieve logs for' },
      type: {
        type: 'string',
        enum: ['deploy', 'build'],
        description: 'Type of logs to retrieve: "deploy" for runtime logs, "build" for build logs (default: deploy)',
      },
    },
    required: ['deploymentId'],
  };

  constructor(private service: RailwayService) {}

  async execute(args: RailwayGetLogsInput): Promise<{ success: boolean; data?: RailwayLogEntry[]; error?: string }> {
    try {
      const logType = args.type ?? 'deploy';

      const logs = logType === 'build'
        ? await this.service.getBuildLogs(args.deploymentId)
        : await this.service.getDeploymentLogs(args.deploymentId);

      return { success: true, data: logs };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
