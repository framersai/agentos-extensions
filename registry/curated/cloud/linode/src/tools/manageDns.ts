// @ts-nocheck
/**
 * @fileoverview LinodeManageDnsTool — manage DNS zones and records via the Linode Domains API.
 */

import type { LinodeService, LinodeDomain, LinodeDomainRecord } from '../LinodeService.js';

export interface ManageDnsInput {
  /** Action to perform */
  action: 'createZone' | 'listZones' | 'addRecord' | 'listRecords' | 'updateRecord' | 'deleteRecord';
  /** Domain name (required for createZone) */
  domain?: string;
  /** SOA email (required for createZone) */
  soaEmail?: string;
  /** Domain zone ID (required for record operations) */
  domainId?: number;
  /** Record ID (required for updateRecord, deleteRecord) */
  recordId?: number;
  /** DNS record type (required for addRecord) */
  recordType?: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'NS' | 'CAA' | 'PTR';
  /** Record name / hostname (required for addRecord) */
  name?: string;
  /** Record target / value (required for addRecord) */
  target?: string;
  /** MX/SRV priority */
  priority?: number;
  /** SRV weight */
  weight?: number;
  /** SRV port */
  port?: number;
  /** TTL in seconds (default: 0 = use zone default) */
  ttlSec?: number;
  /** CAA tag (e.g. "issue", "issuewild", "iodef") */
  tag?: string;
  /** Tags for domain zones */
  tags?: string[];
  /** Domain zone description */
  description?: string;
}

export class LinodeManageDnsTool {
  readonly id = 'linodeManageDns';
  readonly name = 'linodeManageDns';
  readonly displayName = 'Manage DNS';
  readonly description = 'Manage Linode DNS zones and records. Create domain zones, add/update/delete DNS records (A, AAAA, CNAME, MX, TXT, SRV, NS, CAA). Supports all standard record types for complete DNS management.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['createZone', 'listZones', 'addRecord', 'listRecords', 'updateRecord', 'deleteRecord'],
        description: 'Action to perform on DNS zones or records',
      },
      domain: { type: 'string', description: 'Domain name (for createZone, e.g. "example.com")' },
      soaEmail: { type: 'string', description: 'SOA email address (required for createZone)' },
      domainId: { type: 'number', description: 'Domain zone ID (required for record operations)' },
      recordId: { type: 'number', description: 'Record ID (required for updateRecord, deleteRecord)' },
      recordType: {
        type: 'string',
        enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'CAA', 'PTR'],
        description: 'DNS record type (required for addRecord)',
      },
      name: { type: 'string', description: 'Record name/hostname (e.g. "www", "@", "mail")' },
      target: { type: 'string', description: 'Record target/value (e.g. IP address, hostname, text value)' },
      priority: { type: 'number', description: 'MX/SRV priority (lower = higher priority)' },
      weight: { type: 'number', description: 'SRV weight' },
      port: { type: 'number', description: 'SRV port' },
      ttlSec: { type: 'number', description: 'TTL in seconds (0 = zone default)' },
      tag: { type: 'string', description: 'CAA tag (e.g. "issue", "issuewild", "iodef")' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the domain zone' },
      description: { type: 'string', description: 'Description for the domain zone' },
    },
    required: ['action'],
  };

  constructor(private service: LinodeService) {}

  async execute(args: ManageDnsInput): Promise<{
    success: boolean;
    data?: LinodeDomain | LinodeDomain[] | LinodeDomainRecord | LinodeDomainRecord[] | { deleted: boolean; message: string };
    error?: string;
  }> {
    try {
      switch (args.action) {
        case 'createZone': {
          if (!args.domain) return { success: false, error: 'domain is required for createZone' };
          if (!args.soaEmail) return { success: false, error: 'soaEmail is required for createZone' };
          const zone = await this.service.createDomain(args.domain, args.soaEmail, {
            description: args.description,
            tags: args.tags,
          });
          return { success: true, data: zone };
        }

        case 'listZones': {
          const result = await this.service.listDomains();
          return { success: true, data: result.domains };
        }

        case 'addRecord': {
          if (!args.domainId) return { success: false, error: 'domainId is required for addRecord' };
          if (!args.recordType) return { success: false, error: 'recordType is required for addRecord' };
          if (!args.name && args.name !== '') return { success: false, error: 'name is required for addRecord' };
          if (!args.target) return { success: false, error: 'target is required for addRecord' };
          const record = await this.service.createDomainRecord(args.domainId, {
            type: args.recordType,
            name: args.name,
            target: args.target,
            priority: args.priority,
            weight: args.weight,
            port: args.port,
            ttl_sec: args.ttlSec,
            tag: args.tag,
          });
          return { success: true, data: record };
        }

        case 'listRecords': {
          if (!args.domainId) return { success: false, error: 'domainId is required for listRecords' };
          const result = await this.service.listDomainRecords(args.domainId);
          return { success: true, data: result.records };
        }

        case 'updateRecord': {
          if (!args.domainId) return { success: false, error: 'domainId is required for updateRecord' };
          if (!args.recordId) return { success: false, error: 'recordId is required for updateRecord' };
          const updates: Record<string, unknown> = {};
          if (args.recordType) updates.type = args.recordType;
          if (args.name !== undefined) updates.name = args.name;
          if (args.target !== undefined) updates.target = args.target;
          if (args.priority !== undefined) updates.priority = args.priority;
          if (args.weight !== undefined) updates.weight = args.weight;
          if (args.port !== undefined) updates.port = args.port;
          if (args.ttlSec !== undefined) updates.ttl_sec = args.ttlSec;
          if (args.tag !== undefined) updates.tag = args.tag;
          const updated = await this.service.updateDomainRecord(args.domainId, args.recordId, updates);
          return { success: true, data: updated };
        }

        case 'deleteRecord': {
          if (!args.domainId) return { success: false, error: 'domainId is required for deleteRecord' };
          if (!args.recordId) return { success: false, error: 'recordId is required for deleteRecord' };
          await this.service.deleteDomainRecord(args.domainId, args.recordId);
          return { success: true, data: { deleted: true, message: `Record ${args.recordId} deleted from domain ${args.domainId}.` } };
        }

        default:
          return { success: false, error: `Unknown action: ${args.action}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
