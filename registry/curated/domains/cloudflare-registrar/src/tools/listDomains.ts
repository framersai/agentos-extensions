/**
 * @fileoverview CfRegListDomainsTool — list all domains registered via Cloudflare.
 */

import type { CloudflareRegistrarService, RegisteredDomain } from '../CloudflareRegistrarService.js';

export class CfRegListDomainsTool {
  readonly id = 'cfRegListDomains';
  readonly name = 'cfRegListDomains';
  readonly displayName = 'List Cloudflare Domains';
  readonly description = 'List all domains registered via Cloudflare Registrar on the connected account. Shows domain name, status, expiry, auto-renew, lock, privacy, and nameservers.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  };

  constructor(private service: CloudflareRegistrarService) {}

  async execute(_args: Record<string, never>): Promise<{ success: boolean; data?: RegisteredDomain[]; error?: string }> {
    try {
      const domains = await this.service.listDomains();
      return { success: true, data: domains };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
