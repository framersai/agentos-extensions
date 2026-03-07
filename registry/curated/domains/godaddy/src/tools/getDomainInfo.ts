/**
 * @fileoverview GoDaddyGetDomainInfoTool — get detailed domain information.
 */

import type { GoDaddyService, DomainDetail } from '../GoDaddyService.js';

export interface GetDomainInfoInput {
  domain: string;
}

export class GoDaddyGetDomainInfoTool {
  readonly id = 'godaddyGetDomainInfo';
  readonly name = 'godaddyGetDomainInfo';
  readonly displayName = 'Get Domain Info';
  readonly description = 'Get detailed information about a domain in your GoDaddy account. Returns expiry date, nameservers, lock status, auto-renew setting, and WHOIS registrant/admin/tech contacts.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'The domain name to look up (e.g. "example.com")' },
    },
    required: ['domain'],
  };

  constructor(private service: GoDaddyService) {}

  async execute(args: GetDomainInfoInput): Promise<{ success: boolean; data?: DomainDetail; error?: string }> {
    try {
      const detail = await this.service.getDomainDetail(args.domain);
      return { success: true, data: detail };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
