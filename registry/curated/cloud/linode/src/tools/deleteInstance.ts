// @ts-nocheck
/**
 * @fileoverview LinodeDeleteInstanceTool — delete a Linode instance.
 */

import type { LinodeService } from '../LinodeService.js';

export interface DeleteInstanceInput {
  /** The numeric ID of the Linode instance to delete */
  instanceId: number;
}

export class LinodeDeleteInstanceTool {
  readonly id = 'linodeDeleteInstance';
  readonly name = 'linodeDeleteInstance';
  readonly displayName = 'Delete Linode Instance';
  readonly description = 'Permanently delete a Linode instance and all associated disks, IPs, and backups. This action is irreversible. The instance will be shut down and removed immediately.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      instanceId: { type: 'number', description: 'The numeric ID of the Linode instance to delete' },
    },
    required: ['instanceId'],
  };

  constructor(private service: LinodeService) {}

  async execute(args: DeleteInstanceInput): Promise<{
    success: boolean;
    data?: { deleted: boolean; instanceId: number; message: string };
    error?: string;
  }> {
    try {
      await this.service.deleteInstance(args.instanceId);
      return {
        success: true,
        data: {
          deleted: true,
          instanceId: args.instanceId,
          message: `Linode instance ${args.instanceId} has been permanently deleted.`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
