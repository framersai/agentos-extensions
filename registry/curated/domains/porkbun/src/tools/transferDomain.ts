/**
 * @fileoverview PorkbunTransferDomainTool — initiate a domain transfer to Porkbun.
 */

import type { PorkbunService, TransferDomainResult } from '../PorkbunService.js';

export interface TransferDomainInput {
  domain: string;
  authCode: string;
}

export class PorkbunTransferDomainTool {
  readonly id = 'porkbunTransferDomain';
  readonly name = 'porkbunTransferDomain';
  readonly displayName = 'Transfer Domain';
  readonly description = 'Initiate a domain transfer to Porkbun from another registrar. Requires the domain name and the authorization/EPP code from the current registrar. The domain must be unlocked at the current registrar before transferring.';
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

  constructor(private service: PorkbunService) {}

  async execute(args: TransferDomainInput): Promise<{ success: boolean; data?: TransferDomainResult; error?: string }> {
    try {
      const result = await this.service.transferDomain(args.domain, args.authCode);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
