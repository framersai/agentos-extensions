// @ts-nocheck
/**
 * @fileoverview CfRegConfigureDnsTool — manage DNS records on a Cloudflare zone.
 */

import type { CloudflareRegistrarService, DnsRecord } from '../CloudflareRegistrarService.js';

export interface ConfigureDnsInput {
  domain: string;
  action?: 'add' | 'remove' | 'list' | 'update';
  recordId?: string;
  type?: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV' | 'CAA';
  name?: string;
  content?: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  comment?: string;
}

export class CfRegConfigureDnsTool {
  readonly id = 'cfRegConfigureDns';
  readonly name = 'cfRegConfigureDns';
  readonly displayName = 'Configure DNS Records';
  readonly description = 'Manage DNS records for a domain on Cloudflare. Supports adding, removing, listing, and updating records of type A, AAAA, CNAME, TXT, MX, NS, SRV, and CAA. Automatically resolves the zone ID from the domain name.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'The domain name (e.g. "example.com"). The zone ID is resolved automatically.' },
      action: { type: 'string', enum: ['add', 'remove', 'list', 'update'], description: 'Action to perform (default: list)' },
      recordId: { type: 'string', description: 'The DNS record ID (required for remove and update actions)' },
      type: {
        type: 'string',
        enum: ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA'],
        description: 'DNS record type (required for add action)',
      },
      name: { type: 'string', description: 'Record name (e.g. "www.example.com" or "example.com" for root)' },
      content: { type: 'string', description: 'Record value/content (e.g. IP address, hostname, TXT value)' },
      ttl: { type: 'number', description: 'Time to live in seconds (1 = automatic, default: 1)' },
      priority: { type: 'number', description: 'Priority (required for MX records, optional for others)' },
      proxied: { type: 'boolean', description: 'Whether the record is proxied through Cloudflare (default: false, only for A/AAAA/CNAME)' },
      comment: { type: 'string', description: 'Optional comment for the DNS record' },
    },
    required: ['domain'],
  };

  constructor(private service: CloudflareRegistrarService) {}

  async execute(args: ConfigureDnsInput): Promise<{
    success: boolean;
    data?: DnsRecord[] | DnsRecord | { deleted: boolean };
    error?: string;
  }> {
    try {
      const action = args.action ?? 'list';
      const zoneId = await this.service.findZoneId(args.domain);

      switch (action) {
        case 'list': {
          const records = await this.service.listDnsRecords(zoneId);
          return { success: true, data: records };
        }

        case 'add': {
          if (!args.type) {
            return { success: false, error: 'Record type is required for the "add" action. Provide one of: A, AAAA, CNAME, TXT, MX, NS, SRV, CAA.' };
          }
          if (!args.content) {
            return { success: false, error: 'Record content is required for the "add" action (e.g. IP address, hostname, TXT value).' };
          }
          if (!args.name) {
            return { success: false, error: 'Record name is required for the "add" action (e.g. "www.example.com" or "example.com" for root).' };
          }

          const created = await this.service.createDnsRecord(zoneId, {
            name: args.name,
            type: args.type,
            content: args.content,
            ttl: args.ttl,
            priority: args.priority,
            proxied: args.proxied,
            comment: args.comment,
          });
          return { success: true, data: created };
        }

        case 'remove': {
          if (!args.recordId) {
            return { success: false, error: 'Record ID is required for the "remove" action. Use action "list" first to find the record ID.' };
          }
          await this.service.deleteDnsRecord(zoneId, args.recordId);
          return { success: true, data: { deleted: true } };
        }

        case 'update': {
          if (!args.recordId) {
            return { success: false, error: 'Record ID is required for the "update" action. Use action "list" first to find the record ID.' };
          }
          const updated = await this.service.updateDnsRecord(zoneId, args.recordId, {
            name: args.name,
            type: args.type,
            content: args.content,
            ttl: args.ttl,
            priority: args.priority,
            proxied: args.proxied,
            comment: args.comment,
          });
          return { success: true, data: updated };
        }

        default:
          return { success: false, error: `Unknown action: "${action}". Use one of: add, remove, list, update.` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
