// @ts-nocheck
/**
 * @fileoverview PorkbunListDomainsTool — list all domains owned by the Porkbun account.
 */

import type { PorkbunService, OwnedDomain } from '../PorkbunService.js';

export class PorkbunListDomainsTool {
  readonly id = 'porkbunListDomains';
  readonly name = 'porkbunListDomains';
  readonly displayName = 'List Owned Domains';
  readonly description = 'List all domains owned by the connected Porkbun account. Shows domain name, status, TLD, creation and expiry dates, security lock, WHOIS privacy, and auto-renew settings.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  };

  constructor(private service: PorkbunService) {}

  async execute(_args: Record<string, never>): Promise<{ success: boolean; data?: OwnedDomain[]; error?: string }> {
    try {
      const domains = await this.service.listDomains();
      return { success: true, data: domains };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
