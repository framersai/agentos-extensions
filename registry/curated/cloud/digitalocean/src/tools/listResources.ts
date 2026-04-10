// @ts-nocheck
/**
 * @fileoverview DOListResourcesTool — list all apps and/or droplets on a DigitalOcean account.
 */

import type { DigitalOceanService, DOApp, DODroplet } from '../DigitalOceanService.js';

export interface ListResourcesInput {
  resourceType?: 'apps' | 'droplets' | 'all';
  page?: number;
  perPage?: number;
  tag?: string;
}

export interface ListResourcesResult {
  apps?: DOApp[];
  droplets?: DODroplet[];
}

export class DOListResourcesTool {
  readonly id = 'doListResources';
  readonly name = 'doListResources';
  readonly displayName = 'List DO Resources';
  readonly description = 'List all DigitalOcean App Platform apps and/or Droplets. Filter by resource type (apps, droplets, or both) and optionally by tag. Returns names, statuses, regions, IPs, and deployment info.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      resourceType: {
        type: 'string',
        enum: ['apps', 'droplets', 'all'],
        description: 'Which resource type to list (default: "all")',
      },
      page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      perPage: { type: 'number', description: 'Items per page (default: 20, max: 200)' },
      tag: { type: 'string', description: 'Filter droplets by tag name' },
    },
    required: [] as string[],
  };

  constructor(private service: DigitalOceanService) {}

  async execute(args: ListResourcesInput): Promise<{ success: boolean; data?: ListResourcesResult; error?: string }> {
    try {
      const resourceType = args.resourceType ?? 'all';
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const result: ListResourcesResult = {};

      if (resourceType === 'apps' || resourceType === 'all') {
        result.apps = await this.service.listApps(page, perPage);
      }

      if (resourceType === 'droplets' || resourceType === 'all') {
        result.droplets = await this.service.listDroplets(page, perPage, args.tag);
      }

      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
