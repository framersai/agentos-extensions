/**
 * @fileoverview GoDaddySearchDomainTool — check domain availability and get pricing.
 */

import type { GoDaddyService, DomainAvailability } from '../GoDaddyService.js';

export interface SearchDomainInput {
  domain: string;
}

export class GoDaddySearchDomainTool {
  readonly id = 'godaddySearchDomain';
  readonly name = 'godaddySearchDomain';
  readonly displayName = 'Search Domain Availability';
  readonly description = 'Check whether a domain name is available for registration and get pricing information. Returns availability status, price, currency, and registration period.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'The domain name to check (e.g. "example.com")' },
    },
    required: ['domain'],
  };

  constructor(private service: GoDaddyService) {}

  async execute(args: SearchDomainInput): Promise<{ success: boolean; data?: DomainAvailability; error?: string }> {
    try {
      const result = await this.service.checkAvailability(args.domain);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
