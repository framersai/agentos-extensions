// @ts-nocheck
/**
 * @fileoverview CfConfigureDnsTool — manage DNS records on a Cloudflare zone.
 */

import type { CloudflareService, CloudflareDnsRecord } from '../CloudflareService.js';

export interface ConfigureDnsInput {
  domain: string;
  action?: 'add' | 'remove' | 'list' | 'update';
  recordType?: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX';
  name?: string;
  content?: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  comment?: string;
  recordId?: string;
}

export class CfConfigureDnsTool {
  readonly id = 'cfConfigureDns';
  readonly name = 'cfConfigureDns';
  readonly displayName = 'Configure DNS Records';
  readonly description = 'Manage DNS records (A, AAAA, CNAME, TXT, MX) on a Cloudflare zone. Supports adding, removing, listing, and updating records. Automatically looks up the zone ID from the domain name.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'Root domain for the Cloudflare zone (e.g. "example.com")' },
      action: { type: 'string', enum: ['add', 'remove', 'list', 'update'], description: 'Action to perform (default: list)' },
      recordType: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'TXT', 'MX'], description: 'DNS record type (required for add/update)' },
      name: { type: 'string', description: 'Record name / hostname (e.g. "www", "@", "api.example.com")' },
      content: { type: 'string', description: 'Record value (IP address, hostname, or text content)' },
      ttl: { type: 'number', description: 'TTL in seconds (1 = auto, default: 1)' },
      proxied: { type: 'boolean', description: 'Whether to proxy through Cloudflare (default: false)' },
      priority: { type: 'number', description: 'Priority for MX records' },
      comment: { type: 'string', description: 'Optional comment for the record' },
      recordId: { type: 'string', description: 'Record ID (required for update/remove actions)' },
    },
    required: ['domain'],
  };

  constructor(private service: CloudflareService) {}

  async execute(args: ConfigureDnsInput): Promise<{
    success: boolean;
    data?: CloudflareDnsRecord | CloudflareDnsRecord[] | { message: string };
    error?: string;
  }> {
    try {
      const action = args.action ?? 'list';

      // Look up zone ID from domain
      const zone = await this.service.getZoneByDomain(args.domain);

      switch (action) {
        case 'add': {
          if (!args.recordType || !args.name || !args.content) {
            return {
              success: false,
              error: 'recordType, name, and content are required for the "add" action.',
            };
          }

          const record = await this.service.createDnsRecord(zone.id, {
            type: args.recordType,
            name: args.name,
            content: args.content,
            ttl: args.ttl,
            proxied: args.proxied,
            priority: args.priority,
            comment: args.comment,
          });

          return { success: true, data: record };
        }

        case 'remove': {
          if (!args.recordId) {
            return {
              success: false,
              error: 'recordId is required for the "remove" action. Use action "list" first to find the record ID.',
            };
          }

          await this.service.deleteDnsRecord(zone.id, args.recordId);
          return { success: true, data: { message: `DNS record ${args.recordId} deleted.` } };
        }

        case 'update': {
          if (!args.recordId) {
            return {
              success: false,
              error: 'recordId is required for the "update" action. Use action "list" first to find the record ID.',
            };
          }

          const updatePayload: Record<string, unknown> = {};
          if (args.recordType) updatePayload.type = args.recordType;
          if (args.name) updatePayload.name = args.name;
          if (args.content) updatePayload.content = args.content;
          if (args.ttl !== undefined) updatePayload.ttl = args.ttl;
          if (args.proxied !== undefined) updatePayload.proxied = args.proxied;
          if (args.priority !== undefined) updatePayload.priority = args.priority;
          if (args.comment !== undefined) updatePayload.comment = args.comment;

          const updated = await this.service.updateDnsRecord(zone.id, args.recordId, updatePayload);
          return { success: true, data: updated };
        }

        case 'list': {
          const records = await this.service.listDnsRecords(zone.id, {
            type: args.recordType,
            name: args.name,
          });
          return { success: true, data: records };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
