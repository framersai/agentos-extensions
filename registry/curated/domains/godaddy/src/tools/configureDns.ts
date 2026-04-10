// @ts-nocheck
/**
 * @fileoverview GoDaddyConfigureDnsTool — manage DNS records on a GoDaddy domain.
 */

import type { GoDaddyService, DnsRecord } from '../GoDaddyService.js';

export interface ConfigureDnsInput {
  domain: string;
  action: 'add' | 'remove' | 'list' | 'update';
  /** DNS record type (required for add, remove, update; optional for list to filter by type) */
  type?: string;
  /** DNS record name / host (required for remove, update) */
  name?: string;
  /** DNS records to add or update */
  records?: Array<{
    type?: string;
    name?: string;
    data: string;
    ttl?: number;
    priority?: number;
    port?: number;
    weight?: number;
  }>;
}

export class GoDaddyConfigureDnsTool {
  readonly id = 'godaddyConfigureDns';
  readonly name = 'godaddyConfigureDns';
  readonly displayName = 'Configure DNS Records';
  readonly description = 'Manage DNS records for a GoDaddy domain. Supports adding, removing, listing, and updating A, AAAA, CNAME, MX, TXT, NS, and SRV records.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'The domain name (e.g. "example.com")' },
      action: {
        type: 'string',
        enum: ['add', 'remove', 'list', 'update'],
        description: 'Action to perform on DNS records',
      },
      type: {
        type: 'string',
        enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'],
        description: 'DNS record type (required for add/remove/update; optional filter for list)',
      },
      name: {
        type: 'string',
        description: 'DNS record name / host (e.g. "@" for root, "www", "mail"). Required for remove and update.',
      },
      records: {
        type: 'array',
        description: 'DNS records to add or set (for add and update actions)',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Record type (required for add, derived from parent type for update)' },
            name: { type: 'string', description: 'Record name/host (required for add, derived from parent name for update)' },
            data: { type: 'string', description: 'Record value / data (e.g. IP address, hostname)' },
            ttl: { type: 'number', description: 'Time to live in seconds (default: 3600)' },
            priority: { type: 'number', description: 'Priority (for MX and SRV records)' },
            port: { type: 'number', description: 'Port (for SRV records)' },
            weight: { type: 'number', description: 'Weight (for SRV records)' },
          },
          required: ['data'],
        },
      },
    },
    required: ['domain', 'action'],
  };

  constructor(private service: GoDaddyService) {}

  async execute(args: ConfigureDnsInput): Promise<{
    success: boolean;
    data?: DnsRecord[] | { message: string };
    error?: string;
  }> {
    try {
      switch (args.action) {
        case 'list': {
          const records = args.type
            ? await this.service.getDnsRecordsByType(args.domain, args.type)
            : await this.service.getDnsRecords(args.domain);
          return { success: true, data: records };
        }

        case 'add': {
          if (!args.records || args.records.length === 0) {
            return { success: false, error: 'No records provided. Pass records as an array with at least one entry.' };
          }

          const dnsRecords: DnsRecord[] = args.records.map((r) => ({
            type: r.type ?? args.type ?? 'A',
            name: r.name ?? args.name ?? '@',
            data: r.data,
            ttl: r.ttl ?? 3600,
            ...(r.priority !== undefined ? { priority: r.priority } : {}),
            ...(r.port !== undefined ? { port: r.port } : {}),
            ...(r.weight !== undefined ? { weight: r.weight } : {}),
          }));

          await this.service.addDnsRecords(args.domain, dnsRecords);
          return { success: true, data: { message: `Added ${dnsRecords.length} DNS record(s) to ${args.domain}.` } };
        }

        case 'remove': {
          if (!args.type) {
            return { success: false, error: 'Record type is required for remove action (e.g. "A", "CNAME", "TXT").' };
          }
          if (!args.name) {
            return { success: false, error: 'Record name is required for remove action (e.g. "@", "www", "mail").' };
          }

          await this.service.deleteDnsRecords(args.domain, args.type, args.name);
          return { success: true, data: { message: `Deleted ${args.type} records for "${args.name}" on ${args.domain}.` } };
        }

        case 'update': {
          if (!args.type) {
            return { success: false, error: 'Record type is required for update action (e.g. "A", "CNAME", "TXT").' };
          }
          if (!args.name) {
            return { success: false, error: 'Record name is required for update action (e.g. "@", "www", "mail").' };
          }
          if (!args.records || args.records.length === 0) {
            return { success: false, error: 'No records provided. Pass records as an array with the new values.' };
          }

          const updateRecords = args.records.map((r) => ({
            data: r.data,
            ttl: r.ttl ?? 3600,
            ...(r.priority !== undefined ? { priority: r.priority } : {}),
            ...(r.port !== undefined ? { port: r.port } : {}),
            ...(r.weight !== undefined ? { weight: r.weight } : {}),
          }));

          await this.service.replaceDnsRecords(args.domain, args.type, args.name, updateRecords);
          return {
            success: true,
            data: { message: `Replaced ${args.type} records for "${args.name}" on ${args.domain} with ${updateRecords.length} record(s).` },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${args.action}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
