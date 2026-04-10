// @ts-nocheck
/**
 * @fileoverview PorkbunSearchDomainTool — check domain availability and get pricing.
 */

import type { PorkbunService, DomainAvailability } from '../PorkbunService.js';

export interface SearchDomainInput {
  domain: string;
}

export class PorkbunSearchDomainTool {
  readonly id = 'porkbunSearchDomain';
  readonly name = 'porkbunSearchDomain';
  readonly displayName = 'Search Domain Availability';
  readonly description = 'Check if a domain name is available for registration on Porkbun and retrieve pricing information. Provide the full domain including TLD (e.g. "example.com", "mysite.dev").';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'The domain name to check (e.g. "example.com", "coolsite.dev")' },
    },
    required: ['domain'],
  };

  constructor(private service: PorkbunService) {}

  async execute(args: SearchDomainInput): Promise<{ success: boolean; data?: DomainAvailability; error?: string }> {
    try {
      const result = await this.service.checkAvailability(args.domain);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
