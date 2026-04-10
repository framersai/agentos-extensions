// @ts-nocheck
/**
 * @fileoverview CfRegGetDomainInfoTool — get detailed domain info from Cloudflare Registrar.
 */

import type { CloudflareRegistrarService, DomainDetail, DomainSettingsUpdate } from '../CloudflareRegistrarService.js';

export interface GetDomainInfoInput {
  domain: string;
  /** Optional: update registrar settings in the same call. */
  update?: DomainSettingsUpdate;
}

export class CfRegGetDomainInfoTool {
  readonly id = 'cfRegGetDomainInfo';
  readonly name = 'cfRegGetDomainInfo';
  readonly displayName = 'Get Domain Info';
  readonly description = 'Get detailed registrar information for a domain on Cloudflare: expiry date, auto-renew, lock status, WHOIS privacy, transfer status, registry statuses, and fees. Optionally update auto-renew, lock, and privacy settings.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'The domain name (e.g. "example.com")' },
      update: {
        type: 'object',
        description: 'Optional: update registrar settings (auto-renew, lock, privacy) in the same call',
        properties: {
          autoRenew: { type: 'boolean', description: 'Enable or disable auto-renewal' },
          locked: { type: 'boolean', description: 'Enable or disable registrar lock (prevents unauthorized transfers)' },
          privacy: { type: 'boolean', description: 'Enable or disable WHOIS privacy' },
        },
      },
    },
    required: ['domain'],
  };

  constructor(private service: CloudflareRegistrarService) {}

  async execute(args: GetDomainInfoInput): Promise<{ success: boolean; data?: DomainDetail; error?: string }> {
    try {
      // If update fields were provided, apply them first
      if (args.update && Object.keys(args.update).length > 0) {
        const updated = await this.service.updateDomainSettings(args.domain, args.update);
        return { success: true, data: updated };
      }

      const info = await this.service.getDomainInfo(args.domain);
      return { success: true, data: info };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
