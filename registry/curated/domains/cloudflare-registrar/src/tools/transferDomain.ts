// @ts-nocheck
/**
 * @fileoverview CfRegTransferDomainTool — initiate a domain transfer to Cloudflare.
 */

import type { CloudflareRegistrarService, TransferDomainResult } from '../CloudflareRegistrarService.js';

export interface TransferDomainInput {
  domain: string;
  authCode: string;
}

export class CfRegTransferDomainTool {
  readonly id = 'cfRegTransferDomain';
  readonly name = 'cfRegTransferDomain';
  readonly displayName = 'Transfer Domain to Cloudflare';
  readonly description = 'Initiate a domain transfer to Cloudflare Registrar from another registrar. Requires the domain name and the authorization/EPP code from the current registrar. The domain must be unlocked and at least 60 days old at the current registrar before transferring. Note: Cloudflare Registrar does not support new domain registration — only transfers in.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'The domain name to transfer (e.g. "example.com")' },
      authCode: { type: 'string', description: 'The authorization/EPP code from the current registrar (required to authorize the transfer)' },
    },
    required: ['domain', 'authCode'],
  };

  constructor(private service: CloudflareRegistrarService) {}

  async execute(args: TransferDomainInput): Promise<{ success: boolean; data?: TransferDomainResult; error?: string }> {
    try {
      const result = await this.service.transferDomain(args.domain, args.authCode);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
