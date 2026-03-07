/**
 * @fileoverview FlyCreateVolumeTool — create a persistent volume on Fly.io.
 */

import type { FlyService, FlyVolume } from '../FlyService.js';

export interface FlyCreateVolumeInput {
  appName: string;
  name: string;
  region: string;
  sizeGb: number;
  encrypted?: boolean;
}

export class FlyCreateVolumeTool {
  readonly id = 'flyCreateVolume';
  readonly name = 'flyCreateVolume';
  readonly displayName = 'Create Fly.io Volume';
  readonly description = 'Create a persistent volume for a Fly.io app. Volumes persist data across machine restarts and redeployments. Must be in the same region as the machine that mounts it. Encrypted by default.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      appName: { type: 'string', description: 'Name of the Fly app to create the volume in' },
      name: { type: 'string', description: 'Volume name (used in mount config, e.g. "data", "postgres_data")' },
      region: { type: 'string', description: 'Region for the volume (must match the machine region, e.g. "iad", "lax", "cdg")' },
      sizeGb: { type: 'number', description: 'Volume size in GB (minimum: 1)' },
      encrypted: { type: 'boolean', description: 'Whether the volume should be encrypted (default: true)' },
    },
    required: ['appName', 'name', 'region', 'sizeGb'],
  };

  constructor(private service: FlyService) {}

  async execute(args: FlyCreateVolumeInput): Promise<{ success: boolean; data?: FlyVolume; error?: string }> {
    try {
      const volume = await this.service.createVolume(args.appName, {
        name: args.name,
        region: args.region,
        sizeGb: args.sizeGb,
        encrypted: args.encrypted,
      });

      return { success: true, data: volume };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
