// @ts-nocheck
/**
 * @fileoverview LinodeListInstancesTool — list all Linode instances.
 */

import type { LinodeService, LinodeInstance } from '../LinodeService.js';

export class LinodeListInstancesTool {
  readonly id = 'linodeListInstances';
  readonly name = 'linodeListInstances';
  readonly displayName = 'List Linode Instances';
  readonly description = 'List all Linode instances in the account. Returns instance ID, label, status, region, IP addresses, specs, and tags. Supports pagination for large fleets.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      pageSize: { type: 'number', description: 'Number of results per page (default: 100, max: 500)' },
    },
    required: [] as string[],
  };

  constructor(private service: LinodeService) {}

  async execute(args: { page?: number; pageSize?: number }): Promise<{
    success: boolean;
    data?: { instances: LinodeInstance[]; total: number };
    error?: string;
  }> {
    try {
      const result = await this.service.listInstances(args.page ?? 1, args.pageSize ?? 100);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
