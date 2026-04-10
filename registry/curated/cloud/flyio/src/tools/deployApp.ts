// @ts-nocheck
/**
 * @fileoverview FlyDeployAppTool — deploy an app on Fly.io by creating a machine with a config.
 */

import type { FlyService, FlyMachine, FlyMachineConfig, FlyApp } from '../FlyService.js';

export interface FlyDeployAppInput {
  appName: string;
  image: string;
  region?: string;
  cpus?: number;
  cpuKind?: string;
  memoryMb?: number;
  env?: Record<string, string>;
  internalPort?: number;
  autoDestroy?: boolean;
  createApp?: boolean;
  org?: string;
}

export class FlyDeployAppTool {
  readonly id = 'flyDeployApp';
  readonly name = 'flyDeployApp';
  readonly displayName = 'Deploy Fly.io App';
  readonly description = 'Deploy an application on Fly.io by creating a machine with a Docker image. Creates the app first if it does not exist. Configure CPU, memory, region, environment variables, and exposed ports.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      appName: { type: 'string', description: 'Fly app name (e.g. "my-web-app")' },
      image: { type: 'string', description: 'Docker image to deploy (e.g. "registry.fly.io/my-app:latest" or "nginx:alpine")' },
      region: { type: 'string', description: 'Fly region code (e.g. "iad", "lax", "cdg", "nrt"). Defaults to closest.' },
      cpus: { type: 'number', description: 'Number of CPUs (default: 1)' },
      cpuKind: { type: 'string', enum: ['shared', 'performance'], description: 'CPU type (default: shared)' },
      memoryMb: { type: 'number', description: 'Memory in MB (default: 256)' },
      env: { type: 'object', description: 'Environment variables (key-value pairs)' },
      internalPort: { type: 'number', description: 'Internal port the app listens on (default: 8080)' },
      autoDestroy: { type: 'boolean', description: 'Automatically destroy the machine when it exits (default: false)' },
      createApp: { type: 'boolean', description: 'Create the app if it does not exist (default: true)' },
      org: { type: 'string', description: 'Fly organization slug (default: "personal")' },
    },
    required: ['appName', 'image'],
  };

  constructor(private service: FlyService) {}

  async execute(args: FlyDeployAppInput): Promise<{ success: boolean; data?: { app: FlyApp; machine: FlyMachine }; error?: string }> {
    try {
      // Create app if needed
      const shouldCreate = args.createApp !== false;
      let app: FlyApp;

      try {
        app = await this.service.getApp(args.appName);
      } catch {
        if (!shouldCreate) {
          return { success: false, error: `App "${args.appName}" not found. Set createApp to true to create it.` };
        }
        app = await this.service.createApp(args.appName, args.org);
      }

      // Build machine config
      const port = args.internalPort ?? 8080;
      const config: FlyMachineConfig = {
        image: args.image,
        env: args.env,
        guest: {
          cpus: args.cpus ?? 1,
          cpu_kind: args.cpuKind ?? 'shared',
          memory_mb: args.memoryMb ?? 256,
        },
        auto_destroy: args.autoDestroy ?? false,
        services: [
          {
            ports: [
              { port: 80, handlers: ['http'], force_https: true },
              { port: 443, handlers: ['http', 'tls'] },
            ],
            protocol: 'tcp',
            internal_port: port,
            autostart: true,
            autostop: true,
            min_machines_running: 0,
          },
        ],
      };

      const machine = await this.service.createMachine(args.appName, config, {
        region: args.region,
      });

      return {
        success: true,
        data: { app, machine },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
