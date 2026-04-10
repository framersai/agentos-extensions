// @ts-nocheck
/**
 * @fileoverview FlyListAppsTool — list all Fly.io apps and their machines.
 */

import type { FlyService, FlyApp } from '../FlyService.js';

export interface FlyListAppsInput {
  appName?: string;
  includeMachines?: boolean;
}

export class FlyListAppsTool {
  readonly id = 'flyListApps';
  readonly name = 'flyListApps';
  readonly displayName = 'List Fly.io Apps';
  readonly description = 'List all Fly.io apps in the account, or get details for a specific app. Optionally include machine details (state, region, config) for each app.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      appName: { type: 'string', description: 'Filter to a specific app by name (optional — lists all apps if omitted)' },
      includeMachines: { type: 'boolean', description: 'Include machine details for each app (default: true)' },
    },
    required: [] as string[],
  };

  constructor(private service: FlyService) {}

  async execute(args: FlyListAppsInput): Promise<{ success: boolean; data?: FlyApp[]; error?: string }> {
    try {
      const withMachines = args.includeMachines !== false;

      if (args.appName) {
        const app = await this.service.getApp(args.appName);
        if (withMachines) {
          app.machines = await this.service.listMachines(args.appName);
        }
        return { success: true, data: [app] };
      }

      const apps = await this.service.listApps();

      if (withMachines) {
        for (const app of apps) {
          try {
            app.machines = await this.service.listMachines(app.name);
          } catch {
            app.machines = [];
          }
        }
      }

      return { success: true, data: apps };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
