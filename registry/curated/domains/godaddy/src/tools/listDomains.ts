/**
 * @fileoverview GoDaddyListDomainsTool — list all domains in the GoDaddy account.
 */

import type { GoDaddyService, DomainSummary } from '../GoDaddyService.js';

export class GoDaddyListDomainsTool {
  readonly id = 'godaddyListDomains';
  readonly name = 'godaddyListDomains';
  readonly displayName = 'List Domains';
  readonly description = 'List all domains in the connected GoDaddy account. Shows domain name, status, expiry date, auto-renew setting, and nameservers.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      limit: { type: 'number', description: 'Maximum number of domains to return (default: 100, max: 1000)' },
      marker: { type: 'string', description: 'Marker domain for pagination (return domains after this one)' },
    },
    required: [] as string[],
  };

  constructor(private service: GoDaddyService) {}

  async execute(args: { limit?: number; marker?: string }): Promise<{ success: boolean; data?: DomainSummary[]; error?: string }> {
    try {
      const domains = await this.service.listDomains(args.limit ?? 100, args.marker);
      return { success: true, data: domains };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
