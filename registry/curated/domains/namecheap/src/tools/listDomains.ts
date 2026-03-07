/**
 * @fileoverview NamecheapListDomainsTool — list all domains owned by the Namecheap account.
 */

import type { NamecheapService, OwnedDomain } from '../NamecheapService.js';

export interface ListDomainsInput {
  /** Number of domains per page (default: 20, max: 100) */
  pageSize?: number;
  /** Page number (default: 1) */
  page?: number;
}

export class NamecheapListDomainsTool {
  readonly id = 'namecheapListDomains';
  readonly name = 'namecheapListDomains';
  readonly displayName = 'List Owned Domains';
  readonly description = 'List all domains owned by the connected Namecheap account. Shows domain name, creation date, expiry date, lock status, auto-renew setting, and WhoisGuard status. Supports pagination.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      pageSize: { type: 'number', description: 'Number of domains per page (default: 20, max: 100)' },
      page: { type: 'number', description: 'Page number to retrieve (default: 1)' },
    },
    required: [] as string[],
  };

  constructor(private service: NamecheapService) {}

  async execute(args: ListDomainsInput): Promise<{
    success: boolean;
    data?: { domains: OwnedDomain[]; totalItems: number; currentPage: number; pageSize: number };
    error?: string;
  }> {
    try {
      const result = await this.service.listDomains(args.pageSize ?? 20, args.page ?? 1);
      return {
        success: true,
        data: {
          domains: result.domains,
          totalItems: result.totalItems,
          currentPage: result.paging.currentPage,
          pageSize: result.paging.pageSize,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
