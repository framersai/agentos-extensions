// @ts-nocheck
/**
 * @fileoverview NamecheapSearchDomainTool — check domain availability across TLDs.
 */

import type { NamecheapService, DomainAvailability } from '../NamecheapService.js';

export interface SearchDomainInput {
  /** Comma-separated list of domains to check (e.g. "example.com,example.net,example.io") */
  domains: string;
}

export class NamecheapSearchDomainTool {
  readonly id = 'namecheapSearchDomain';
  readonly name = 'namecheapSearchDomain';
  readonly displayName = 'Search Domain Availability';
  readonly description = 'Check whether one or more domains are available for registration. Provide a comma-separated list of fully-qualified domain names (e.g. "example.com,example.net"). Returns availability status and premium pricing if applicable.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domains: {
        type: 'string',
        description: 'Comma-separated list of domains to check (e.g. "example.com,example.net,example.io")',
      },
    },
    required: ['domains'],
  };

  constructor(private service: NamecheapService) {}

  async execute(args: SearchDomainInput): Promise<{ success: boolean; data?: DomainAvailability[]; error?: string }> {
    try {
      const results = await this.service.checkAvailability(args.domains);
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
