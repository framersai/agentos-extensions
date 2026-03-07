/**
 * @fileoverview NetlifyListSitesTool — list all sites on a Netlify account.
 */

import type { NetlifyService, NetlifySite } from '../NetlifyService.js';

export class NetlifyListSitesTool {
  readonly id = 'netlifyListSites';
  readonly name = 'netlifyListSites';
  readonly displayName = 'List Netlify Sites';
  readonly description = 'List all sites in the connected Netlify account. Shows site name, URL, linked Git repo, custom domain, and current deployment state.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      limit: { type: 'number', description: 'Maximum number of sites to return (default: 20, max: 100)' },
    },
    required: [] as string[],
  };

  constructor(private service: NetlifyService) {}

  async execute(args: { limit?: number }): Promise<{ success: boolean; data?: NetlifySite[]; error?: string }> {
    try {
      const sites = await this.service.listSites(args.limit ?? 20);
      return { success: true, data: sites };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
