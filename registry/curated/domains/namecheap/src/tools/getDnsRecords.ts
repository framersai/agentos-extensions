// @ts-nocheck
/**
 * @fileoverview NamecheapGetDnsRecordsTool — retrieve current DNS host records for a domain.
 */

import { NamecheapService } from '../NamecheapService.js';
import type { DnsRecord } from '../NamecheapService.js';

export interface GetDnsRecordsInput {
  /** Fully-qualified domain name (e.g. "example.com") */
  domain: string;
}

export class NamecheapGetDnsRecordsTool {
  readonly id = 'namecheapGetDnsRecords';
  readonly name = 'namecheapGetDnsRecords';
  readonly displayName = 'Get DNS Records';
  readonly description = 'Retrieve all current DNS host records for a domain managed by Namecheap. Returns record type, hostname, address/value, TTL, MX priority, and active status for each record.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'Fully-qualified domain name (e.g. "example.com")' },
    },
    required: ['domain'],
  };

  constructor(private service: NamecheapService) {}

  async execute(args: GetDnsRecordsInput): Promise<{ success: boolean; data?: { domain: string; records: DnsRecord[] }; error?: string }> {
    try {
      const { sld, tld } = NamecheapService.splitDomain(args.domain);
      const records = await this.service.getDnsHosts(sld, tld);

      return {
        success: true,
        data: { domain: args.domain, records },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
