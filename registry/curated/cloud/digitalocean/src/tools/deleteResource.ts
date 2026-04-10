// @ts-nocheck
/**
 * @fileoverview DODeleteResourceTool — delete an app or droplet from DigitalOcean.
 */

import type { DigitalOceanService } from '../DigitalOceanService.js';

export interface DeleteResourceInput {
  resourceType: 'app' | 'droplet';
  resourceId: string;
}

export class DODeleteResourceTool {
  readonly id = 'doDeleteResource';
  readonly name = 'doDeleteResource';
  readonly displayName = 'Delete DO Resource';
  readonly description = 'Permanently delete a DigitalOcean App Platform app or Droplet. This action is irreversible — the resource and all associated data will be destroyed.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      resourceType: {
        type: 'string',
        enum: ['app', 'droplet'],
        description: 'Type of resource to delete',
      },
      resourceId: {
        type: 'string',
        description: 'Resource ID to delete (app UUID or droplet numeric ID)',
      },
    },
    required: ['resourceType', 'resourceId'],
  };

  constructor(private service: DigitalOceanService) {}

  async execute(args: DeleteResourceInput): Promise<{ success: boolean; data?: { message: string }; error?: string }> {
    try {
      switch (args.resourceType) {
        case 'app': {
          await this.service.deleteApp(args.resourceId);
          return { success: true, data: { message: `App ${args.resourceId} has been deleted.` } };
        }

        case 'droplet': {
          const dropletId = parseInt(args.resourceId, 10);
          if (isNaN(dropletId)) {
            return { success: false, error: `Invalid droplet ID: "${args.resourceId}". Must be a numeric ID.` };
          }
          await this.service.deleteDroplet(dropletId);
          return { success: true, data: { message: `Droplet ${dropletId} has been deleted.` } };
        }

        default:
          return { success: false, error: `Unknown resource type: ${args.resourceType}. Use "app" or "droplet".` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
