// @ts-nocheck
/**
 * @fileoverview VercelConfigureDomainTool — add or manage custom domains on a Vercel project.
 */

import type { VercelService, VercelDomain } from '../VercelService.js';

export interface ConfigureDomainInput {
  projectId: string;
  domain: string;
  action?: 'add' | 'remove' | 'list' | 'check';
  gitBranch?: string;
}

export class VercelConfigureDomainTool {
  readonly id = 'vercelConfigureDomain';
  readonly name = 'vercelConfigureDomain';
  readonly displayName = 'Configure Domain';
  readonly description = 'Add, remove, or list custom domains on a Vercel project. Also checks DNS configuration status and returns required CNAME/A records for setup.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Vercel project ID or name' },
      domain: { type: 'string', description: 'The custom domain (e.g. "example.com" or "www.example.com")' },
      action: { type: 'string', enum: ['add', 'remove', 'list', 'check'], description: 'Action to perform (default: add)' },
      gitBranch: { type: 'string', description: 'Git branch to link the domain to (optional)' },
    },
    required: ['projectId', 'domain'],
  };

  constructor(private service: VercelService) {}

  async execute(args: ConfigureDomainInput): Promise<{
    success: boolean;
    data?: VercelDomain | VercelDomain[] | { dnsInstructions: string };
    error?: string;
  }> {
    try {
      const action = args.action ?? 'add';

      switch (action) {
        case 'add': {
          const domain = await this.service.addDomain(args.projectId, args.domain, {
            gitBranch: args.gitBranch,
          });

          // Also get DNS config instructions
          let dnsNote = '';
          try {
            const config = await this.service.getDomainConfig(args.domain);
            if (config.misconfigured) {
              dnsNote = ` DNS setup required: set CNAME record for "${args.domain}" pointing to "cname.vercel-dns.com".`;
            }
          } catch { /* ignore — domain might not be resolvable yet */ }

          return {
            success: true,
            data: { ...domain, ...(dnsNote ? { dnsInstructions: dnsNote } as any : {}) },
          };
        }

        case 'remove': {
          await this.service.removeDomain(args.projectId, args.domain);
          return { success: true, data: { dnsInstructions: `Domain "${args.domain}" removed from project.` } };
        }

        case 'list': {
          const domains = await this.service.listDomains(args.projectId);
          return { success: true, data: domains };
        }

        case 'check': {
          const config = await this.service.getDomainConfig(args.domain);
          const instructions = config.misconfigured
            ? `DNS misconfigured. Set a CNAME record for "${args.domain}" pointing to "cname.vercel-dns.com". Or set an A record to 76.76.21.21.`
            : `Domain "${args.domain}" is properly configured.`;
          return { success: true, data: { dnsInstructions: instructions } };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
