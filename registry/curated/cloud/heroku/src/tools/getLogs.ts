/**
 * @fileoverview HerokuGetLogsTool — retrieve recent logs from a Heroku app.
 */

import type { HerokuService } from '../HerokuService.js';

export interface HerokuGetLogsInput {
  appName: string;
  lines?: number;
  dyno?: string;
  source?: string;
}

export class HerokuGetLogsTool {
  readonly id = 'herokuGetLogs';
  readonly name = 'herokuGetLogs';
  readonly displayName = 'Get Heroku Logs';
  readonly description = 'Retrieve recent log output from a Heroku app. Can filter by dyno type (e.g. "web.1") or source (e.g. "app", "heroku"). Returns the most recent N log lines.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      appName: { type: 'string', description: 'Name of the Heroku app to fetch logs from' },
      lines: { type: 'number', description: 'Number of recent log lines to retrieve (default: 100, max: 1500)' },
      dyno: { type: 'string', description: 'Filter to a specific dyno (e.g. "web.1", "worker.1")' },
      source: { type: 'string', description: 'Filter by log source: "app" (application), "heroku" (platform)' },
    },
    required: ['appName'],
  };

  constructor(private service: HerokuService) {}

  async execute(args: HerokuGetLogsInput): Promise<{ success: boolean; data?: { logs: string; logplexUrl: string }; error?: string }> {
    try {
      const session = await this.service.createLogSession(args.appName, {
        lines: args.lines ?? 100,
        dyno: args.dyno,
        source: args.source,
        tail: false,
      });

      const logs = await this.service.fetchLogs(session.logplexUrl);

      return {
        success: true,
        data: {
          logs,
          logplexUrl: session.logplexUrl,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
