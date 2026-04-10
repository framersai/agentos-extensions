// @ts-nocheck
/**
 * @fileoverview DOManageDnsTool — manage DNS records on a DigitalOcean domain.
 */

import type { DigitalOceanService, DODomain, DODomainRecord } from '../DigitalOceanService.js';

export interface ManageDnsInput {
  action: 'list-domains' | 'add-domain' | 'list' | 'add' | 'update' | 'delete';
  domain?: string;
  recordId?: number;
  recordType?: string;
  name?: string;
  data?: string;
  ttl?: number;
  priority?: number;
  port?: number;
  weight?: number;
}

export class DOManageDnsTool {
  readonly id = 'doManageDns';
  readonly name = 'doManageDns';
  readonly displayName = 'Manage DO DNS';
  readonly description = 'Manage DNS records on a DigitalOcean domain. Supports listing domains, adding domains, and full CRUD on DNS records (A, AAAA, CNAME, MX, TXT, SRV, NS, CAA). Use action "list-domains" to see all domains, "add-domain" to register a new domain, "list" to view records, "add"/"update"/"delete" to manage records.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['list-domains', 'add-domain', 'list', 'add', 'update', 'delete'],
        description: 'Action to perform on DNS',
      },
      domain: { type: 'string', description: 'Domain name (e.g. "example.com"). Required for all actions except "list-domains".' },
      recordId: { type: 'number', description: 'Record ID (required for "update" and "delete" actions)' },
      recordType: { type: 'string', description: 'DNS record type (e.g. "A", "AAAA", "CNAME", "MX", "TXT", "SRV", "NS", "CAA")' },
      name: { type: 'string', description: 'Record name/hostname (e.g. "@", "www", "mail")' },
      data: { type: 'string', description: 'Record data/value (e.g. IP address, CNAME target, MX server)' },
      ttl: { type: 'number', description: 'Time-to-live in seconds (default: 1800)' },
      priority: { type: 'number', description: 'Priority (for MX and SRV records)' },
      port: { type: 'number', description: 'Port (for SRV records)' },
      weight: { type: 'number', description: 'Weight (for SRV records)' },
    },
    required: ['action'],
  };

  constructor(private service: DigitalOceanService) {}

  async execute(args: ManageDnsInput): Promise<{
    success: boolean;
    data?: DODomain | DODomain[] | DODomainRecord | DODomainRecord[] | { message: string };
    error?: string;
  }> {
    try {
      switch (args.action) {
        case 'list-domains': {
          const domains = await this.service.listDomains();
          return { success: true, data: domains };
        }

        case 'add-domain': {
          if (!args.domain) {
            return { success: false, error: 'Domain name is required for "add-domain" action.' };
          }
          const domain = await this.service.addDomain(args.domain);
          return { success: true, data: domain };
        }

        case 'list': {
          if (!args.domain) {
            return { success: false, error: 'Domain name is required for "list" action.' };
          }
          const records = await this.service.listDomainRecords(args.domain);
          return { success: true, data: records };
        }

        case 'add': {
          if (!args.domain) {
            return { success: false, error: 'Domain name is required for "add" action.' };
          }
          if (!args.recordType || !args.name || !args.data) {
            return { success: false, error: 'recordType, name, and data are required for "add" action.' };
          }
          const record = await this.service.createDomainRecord(args.domain, {
            type: args.recordType,
            name: args.name,
            data: args.data,
            ttl: args.ttl,
            priority: args.priority,
            port: args.port,
            weight: args.weight,
          });
          return { success: true, data: record };
        }

        case 'update': {
          if (!args.domain || args.recordId == null) {
            return { success: false, error: 'Domain name and recordId are required for "update" action.' };
          }
          const updated = await this.service.updateDomainRecord(args.domain, args.recordId, {
            type: args.recordType,
            name: args.name,
            data: args.data,
            ttl: args.ttl,
            priority: args.priority,
            port: args.port,
            weight: args.weight,
          });
          return { success: true, data: updated };
        }

        case 'delete': {
          if (!args.domain || args.recordId == null) {
            return { success: false, error: 'Domain name and recordId are required for "delete" action.' };
          }
          await this.service.deleteDomainRecord(args.domain, args.recordId);
          return { success: true, data: { message: `Record ${args.recordId} deleted from ${args.domain}.` } };
        }

        default:
          return { success: false, error: `Unknown action: ${args.action}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
