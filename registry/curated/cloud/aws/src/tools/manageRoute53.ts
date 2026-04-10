// @ts-nocheck
/**
 * @fileoverview AWSManageRoute53Tool — manage DNS records in Route53 hosted zones.
 *
 * Supports adding, removing, upserting, and listing DNS records across hosted zones.
 * Handles A, AAAA, CNAME, MX, TXT, NS, and alias records.
 */

import type { AWSService, Route53HostedZone, Route53Record } from '../AWSService.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ManageRoute53Input {
  /** Action to perform. */
  action: 'add' | 'remove' | 'upsert' | 'list' | 'list-zones';
  /** Hosted zone ID (required for add/remove/upsert/list). */
  hostedZoneId?: string;
  /** DNS record name (e.g. "example.com" or "www.example.com"). Required for add/remove/upsert. */
  recordName?: string;
  /** DNS record type (e.g. "A", "AAAA", "CNAME", "MX", "TXT"). Required for add/remove/upsert. */
  recordType?: string;
  /** Record values (e.g. ["1.2.3.4"] for A, ["target.example.com"] for CNAME). Required for add/upsert. */
  values?: string[];
  /** TTL in seconds (default: 300). */
  ttl?: number;
  /** Alias target for alias records (instead of values). */
  aliasTarget?: {
    hostedZoneId: string;
    dnsName: string;
    evaluateTargetHealth?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class AWSManageRoute53Tool {
  readonly id = 'awsManageRoute53';
  readonly name = 'awsManageRoute53';
  readonly displayName = 'Manage Route53 DNS';
  readonly description = 'Manage DNS records in AWS Route53 hosted zones. Supports adding, removing, upserting (add-or-update), and listing DNS records. Handles A, AAAA, CNAME, MX, TXT, NS records and Route53 alias records for CloudFront, S3, ALB, etc.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'remove', 'upsert', 'list', 'list-zones'],
        description: 'Action to perform',
      },
      hostedZoneId: {
        type: 'string',
        description: 'Hosted zone ID (required for add/remove/upsert/list)',
      },
      recordName: {
        type: 'string',
        description: 'DNS record name (e.g. "example.com", "www.example.com")',
      },
      recordType: {
        type: 'string',
        enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'CAA'],
        description: 'DNS record type',
      },
      values: {
        type: 'array',
        items: { type: 'string' },
        description: 'Record values (e.g. ["1.2.3.4"] for A, ["target.example.com"] for CNAME)',
      },
      ttl: {
        type: 'number',
        description: 'TTL in seconds (default: 300)',
      },
      aliasTarget: {
        type: 'object',
        properties: {
          hostedZoneId: { type: 'string', description: 'Hosted zone ID of the alias target' },
          dnsName: { type: 'string', description: 'DNS name of the alias target' },
          evaluateTargetHealth: { type: 'boolean', description: 'Whether to evaluate target health (default: false)' },
        },
        required: ['hostedZoneId', 'dnsName'],
        description: 'Alias target for Route53 alias records (CloudFront, S3, ALB, etc.)',
      },
    },
    required: ['action'],
  };

  constructor(private service: AWSService) {}

  async execute(args: ManageRoute53Input): Promise<{
    success: boolean;
    data?: Route53HostedZone[] | Route53Record[] | { changeId: string; status: string };
    error?: string;
  }> {
    try {
      switch (args.action) {
        case 'list-zones': {
          const zones = await this.service.listHostedZones();
          return { success: true, data: zones };
        }

        case 'list': {
          if (!args.hostedZoneId) {
            return { success: false, error: 'hostedZoneId is required for list action' };
          }
          const records = await this.service.listRecordSets(args.hostedZoneId);
          return { success: true, data: records };
        }

        case 'add':
        case 'upsert': {
          if (!args.hostedZoneId) {
            return { success: false, error: 'hostedZoneId is required' };
          }
          if (!args.recordName || !args.recordType) {
            return { success: false, error: 'recordName and recordType are required' };
          }
          if (!args.values?.length && !args.aliasTarget) {
            return { success: false, error: 'Either values or aliasTarget is required' };
          }

          // Ensure record name ends with a dot (FQDN)
          const name = args.recordName.endsWith('.') ? args.recordName : `${args.recordName}.`;

          const result = await this.service.changeRecordSets(args.hostedZoneId, [{
            action: args.action === 'add' ? 'CREATE' : 'UPSERT',
            name,
            type: args.recordType,
            ttl: args.ttl,
            values: args.values ?? [],
            aliasTarget: args.aliasTarget,
          }]);
          return { success: true, data: result };
        }

        case 'remove': {
          if (!args.hostedZoneId) {
            return { success: false, error: 'hostedZoneId is required' };
          }
          if (!args.recordName || !args.recordType) {
            return { success: false, error: 'recordName and recordType are required' };
          }
          if (!args.values?.length && !args.aliasTarget) {
            return { success: false, error: 'Either values or aliasTarget is required to identify the record to remove' };
          }

          const name = args.recordName.endsWith('.') ? args.recordName : `${args.recordName}.`;

          const result = await this.service.changeRecordSets(args.hostedZoneId, [{
            action: 'DELETE',
            name,
            type: args.recordType,
            ttl: args.ttl,
            values: args.values ?? [],
            aliasTarget: args.aliasTarget,
          }]);
          return { success: true, data: result };
        }

        default:
          return { success: false, error: `Unknown action: ${args.action}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
