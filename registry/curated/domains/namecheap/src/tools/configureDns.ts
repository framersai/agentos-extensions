/**
 * @fileoverview NamecheapConfigureDnsTool — set DNS host records for a domain.
 *
 * WARNING: This tool replaces ALL existing DNS records for the domain.
 * To add records without losing existing ones, first retrieve current
 * records with namecheapGetDnsRecords, then include them in the new set.
 */

import { NamecheapService } from '../NamecheapService.js';
import type { DnsHostEntry } from '../NamecheapService.js';

export interface ConfigureDnsInput {
  /** Fully-qualified domain name (e.g. "example.com") */
  domain: string;
  /** Array of DNS host records to set. Replaces ALL existing records. */
  records: DnsHostEntry[];
}

export class NamecheapConfigureDnsTool {
  readonly id = 'namecheapConfigureDns';
  readonly name = 'namecheapConfigureDns';
  readonly displayName = 'Configure DNS Records';
  readonly description = 'Set DNS host records for a domain managed by Namecheap. Supports A, AAAA, CNAME, MX, TXT, URL, URL301, and FRAME record types. WARNING: This replaces ALL existing records — include existing records you want to keep.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'Fully-qualified domain name (e.g. "example.com")' },
      records: {
        type: 'array',
        description: 'Array of DNS records to set. Each record needs: hostName (e.g. "@", "www"), recordType (A, AAAA, CNAME, MX, TXT, URL, URL301, FRAME), address (value). Optional: mxPref (default "10"), ttl (default "1800").',
        items: {
          type: 'object',
          properties: {
            hostName: { type: 'string', description: 'Hostname (e.g. "@" for root, "www", "mail", "*" for wildcard)' },
            recordType: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'URL', 'URL301', 'FRAME'], description: 'DNS record type' },
            address: { type: 'string', description: 'Record value (IP address, hostname, or text content)' },
            mxPref: { type: 'string', description: 'MX preference/priority (default "10", only for MX records)' },
            ttl: { type: 'string', description: 'Time to live in seconds (default "1800")' },
          },
          required: ['hostName', 'recordType', 'address'],
        },
      },
    },
    required: ['domain', 'records'],
  };

  constructor(private service: NamecheapService) {}

  async execute(args: ConfigureDnsInput): Promise<{ success: boolean; data?: { domain: string; recordsSet: number }; error?: string }> {
    try {
      if (!args.records || args.records.length === 0) {
        return { success: false, error: 'No DNS records provided. Pass at least one record in the records array.' };
      }

      const { sld, tld } = NamecheapService.splitDomain(args.domain);
      const result = await this.service.setDnsHosts(sld, tld, args.records);

      if (!result.success) {
        return { success: false, error: `Namecheap API reported failure when setting DNS records for ${args.domain}.` };
      }

      return {
        success: true,
        data: { domain: args.domain, recordsSet: args.records.length },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
