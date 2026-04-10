// @ts-nocheck
/**
 * @fileoverview CfListProjectsTool — list all Cloudflare Pages projects.
 */

import type { CloudflareService, CloudflarePagesProject } from '../CloudflareService.js';

export class CfListProjectsTool {
  readonly id = 'cfListProjects';
  readonly name = 'cfListProjects';
  readonly displayName = 'List Pages Projects';
  readonly description = 'List all Cloudflare Pages projects in the connected account. Shows project name, subdomain, production branch, linked Git repo, and latest deployment status.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      limit: { type: 'number', description: 'Maximum number of projects to return (default: 25, max: 100)' },
    },
    required: [] as string[],
  };

  constructor(private service: CloudflareService) {}

  async execute(args: { limit?: number }): Promise<{ success: boolean; data?: CloudflarePagesProject[]; error?: string }> {
    try {
      const projects = await this.service.listProjects(args.limit ?? 25);
      return { success: true, data: projects };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
