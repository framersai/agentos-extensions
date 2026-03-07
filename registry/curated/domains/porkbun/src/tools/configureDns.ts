/**
 * @fileoverview PorkbunConfigureDnsTool — manage DNS records for a Porkbun domain.
 */

import type { PorkbunService, DnsRecord } from '../PorkbunService.js';

export interface ConfigureDnsInput {
  domain: string;
  action?: 'add' | 'remove' | 'list' | 'update';
  recordId?: string;
  type?: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV' | 'TLSA' | 'CAA' | 'ALIAS';
  name?: string;
  content?: string;
  ttl?: string;
  prio?: string;
}

export class PorkbunConfigureDnsTool {
  readonly id = 'porkbunConfigureDns';
  readonly name = 'porkbunConfigureDns';
  readonly displayName = 'Configure DNS Records';
  readonly description = 'Manage DNS records for a domain on Porkbun. Supports adding, removing, listing, and updating records of type A, AAAA, CNAME, TXT, MX, NS, SRV, TLSA, CAA, and ALIAS.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'The domain name (e.g. "example.com")' },
      action: { type: 'string', enum: ['add', 'remove', 'list', 'update'], description: 'Action to perform (default: list)' },
      recordId: { type: 'string', description: 'The DNS record ID (required for remove and update actions)' },
      type: {
        type: 'string',
        enum: ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'TLSA', 'CAA', 'ALIAS'],
        description: 'DNS record type (required for add action)',
      },
      name: { type: 'string', description: 'Subdomain or record name (e.g. "www", "mail"). Empty string or omit for root domain.' },
      content: { type: 'string', description: 'Record value/content (e.g. IP address, hostname, TXT value)' },
      ttl: { type: 'string', description: 'Time to live in seconds (default: "300")' },
      prio: { type: 'string', description: 'Priority (required for MX records, optional for others)' },
    },
    required: ['domain'],
  };

  constructor(private service: PorkbunService) {}

  async execute(args: ConfigureDnsInput): Promise<{
    success: boolean;
    data?: DnsRecord[] | DnsRecord | { id: string } | { deleted: boolean };
    error?: string;
  }> {
    try {
      const action = args.action ?? 'list';

      switch (action) {
        case 'list': {
          const records = await this.service.listDnsRecords(args.domain);
          return { success: true, data: records };
        }

        case 'add': {
          if (!args.type) {
            return { success: false, error: 'Record type is required for the "add" action. Provide one of: A, AAAA, CNAME, TXT, MX, NS, SRV, TLSA, CAA, ALIAS.' };
          }
          if (!args.content) {
            return { success: false, error: 'Record content is required for the "add" action (e.g. IP address, hostname, TXT value).' };
          }

          const created = await this.service.createDnsRecord(args.domain, {
            name: args.name,
            type: args.type,
            content: args.content,
            ttl: args.ttl,
            prio: args.prio,
          });
          return { success: true, data: created };
        }

        case 'remove': {
          if (!args.recordId) {
            return { success: false, error: 'Record ID is required for the "remove" action. Use action "list" first to find the record ID.' };
          }
          await this.service.deleteDnsRecord(args.domain, args.recordId);
          return { success: true, data: { deleted: true } };
        }

        case 'update': {
          if (!args.recordId) {
            return { success: false, error: 'Record ID is required for the "update" action. Use action "list" first to find the record ID.' };
          }
          await this.service.editDnsRecord(args.domain, args.recordId, {
            name: args.name,
            type: args.type,
            content: args.content,
            ttl: args.ttl,
            prio: args.prio,
          });

          // Return the updated records for the domain so the caller can confirm
          const records = await this.service.listDnsRecords(args.domain);
          const updated = records.find(r => r.id === args.recordId);
          return { success: true, data: updated ?? records };
        }

        default:
          return { success: false, error: `Unknown action: "${action}". Use one of: add, remove, list, update.` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
