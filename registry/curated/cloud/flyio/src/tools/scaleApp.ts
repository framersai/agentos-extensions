// @ts-nocheck
/**
 * @fileoverview FlyScaleAppTool — scale machines for a Fly.io app.
 */

import type { FlyService, FlyMachine, FlyMachineConfig } from '../FlyService.js';

export interface FlyScaleAppInput {
  appName: string;
  count: number;
  cpus?: number;
  cpuKind?: string;
  memoryMb?: number;
  region?: string;
}

export class FlyScaleAppTool {
  readonly id = 'flyScaleApp';
  readonly name = 'flyScaleApp';
  readonly displayName = 'Scale Fly.io App';
  readonly description = 'Scale a Fly.io app by adjusting the number of machines and optionally their VM size. Can scale up (create new machines cloned from existing config) or scale down (destroy excess machines). Optionally resize CPUs and memory.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      appName: { type: 'string', description: 'Name of the Fly app to scale' },
      count: { type: 'number', description: 'Desired number of machines (0 to stop all)' },
      cpus: { type: 'number', description: 'CPUs per machine (only applied to new or resized machines)' },
      cpuKind: { type: 'string', enum: ['shared', 'performance'], description: 'CPU type (only applied to new or resized machines)' },
      memoryMb: { type: 'number', description: 'Memory in MB per machine (only applied to new or resized machines)' },
      region: { type: 'string', description: 'Region for new machines (e.g. "iad", "lax", "cdg")' },
    },
    required: ['appName', 'count'],
  };

  constructor(private service: FlyService) {}

  async execute(args: FlyScaleAppInput): Promise<{
    success: boolean;
    data?: { machines: FlyMachine[]; created: number; destroyed: number; resized: number };
    error?: string;
  }> {
    try {
      const existing = await this.service.listMachines(args.appName);
      const current = existing.length;
      const desired = args.count;
      let created = 0;
      let destroyed = 0;
      let resized = 0;

      // Determine if we need to resize existing machines
      const needsResize = args.cpus !== undefined || args.cpuKind !== undefined || args.memoryMb !== undefined;

      // Scale down: destroy excess machines
      if (desired < current) {
        const toDestroy = existing.slice(desired);
        for (const machine of toDestroy) {
          await this.service.destroyMachine(args.appName, machine.id);
          destroyed++;
        }
      }

      // Resize remaining machines if needed
      if (needsResize) {
        const toResize = existing.slice(0, Math.min(desired, current));
        for (const machine of toResize) {
          const guest = {
            cpus: args.cpus ?? machine.config.guest?.cpus ?? 1,
            cpu_kind: args.cpuKind ?? machine.config.guest?.cpu_kind ?? 'shared',
            memory_mb: args.memoryMb ?? machine.config.guest?.memory_mb ?? 256,
          };
          await this.service.updateMachine(args.appName, machine.id, { guest });
          resized++;
        }
      }

      // Scale up: create new machines cloned from the first machine's config
      if (desired > current) {
        const template = existing[0]?.config ?? { image: '' };
        const baseConfig: FlyMachineConfig = {
          ...template,
          guest: {
            cpus: args.cpus ?? template.guest?.cpus ?? 1,
            cpu_kind: args.cpuKind ?? template.guest?.cpu_kind ?? 'shared',
            memory_mb: args.memoryMb ?? template.guest?.memory_mb ?? 256,
          },
        };

        for (let i = current; i < desired; i++) {
          await this.service.createMachine(args.appName, baseConfig, {
            region: args.region,
          });
          created++;
        }
      }

      // Get final state
      const finalMachines = await this.service.listMachines(args.appName);

      return {
        success: true,
        data: {
          machines: finalMachines,
          created,
          destroyed,
          resized,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
