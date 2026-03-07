/**
 * @fileoverview NetlifyConfigureDomainTool — add or manage custom domains on a Netlify site.
 */

import type { NetlifyService, NetlifyDomain } from '../NetlifyService.js';

export interface ConfigureDomainInput {
  siteId: string;
  domain: string;
  action?: 'add' | 'remove' | 'list' | 'check';
}

export class NetlifyConfigureDomainTool {
  readonly id = 'netlifyConfigureDomain';
  readonly name = 'netlifyConfigureDomain';
  readonly displayName = 'Configure Domain';
  readonly description = 'Add, remove, or list custom domains on a Netlify site. Also checks DNS configuration status and returns required DNS records for setup. Netlify provides automatic SSL via Let\'s Encrypt.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      siteId: { type: 'string', description: 'Netlify site ID or name (e.g. "my-site" or the site UUID)' },
      domain: { type: 'string', description: 'The custom domain (e.g. "example.com" or "www.example.com")' },
      action: { type: 'string', enum: ['add', 'remove', 'list', 'check'], description: 'Action to perform (default: add)' },
    },
    required: ['siteId', 'domain'],
  };

  constructor(private service: NetlifyService) {}

  async execute(args: ConfigureDomainInput): Promise<{
    success: boolean;
    data?: NetlifyDomain | NetlifyDomain[] | { dnsInstructions: string };
    error?: string;
  }> {
    try {
      const action = args.action ?? 'add';

      switch (action) {
        case 'add': {
          const site = await this.service.setCustomDomain(args.siteId, args.domain);

          // Provide DNS setup instructions
          const isApex = !args.domain.includes('.') || args.domain.split('.').length === 2;
          const dnsNote = isApex
            ? `DNS setup required: add an A record for "${args.domain}" pointing to Netlify's load balancer IP (75.2.60.5). Alternatively, use Netlify DNS for automatic configuration.`
            : `DNS setup required: add a CNAME record for "${args.domain}" pointing to "${site.default_domain}".`;

          return {
            success: true,
            data: {
              hostname: args.domain,
              ssl_url: site.ssl_url,
              configured: false,
              dnsInstructions: dnsNote,
            } as any,
          };
        }

        case 'remove': {
          // Remove custom domain by updating site with empty domain
          await this.service.updateSite(args.siteId, { customDomain: '' });
          return { success: true, data: { dnsInstructions: `Domain "${args.domain}" removed from site.` } };
        }

        case 'list': {
          const domains = await this.service.listDomainAliases(args.siteId);
          return { success: true, data: domains };
        }

        case 'check': {
          const zone = await this.service.getDnsZone(args.domain);
          if (zone) {
            const hasRecords = zone.records.length > 0;
            const instructions = hasRecords
              ? `Domain "${args.domain}" has ${zone.records.length} DNS record(s) configured in Netlify DNS.`
              : `Domain "${args.domain}" has a DNS zone but no records. Add an A record pointing to 75.2.60.5 or a CNAME to your Netlify subdomain.`;
            return { success: true, data: { dnsInstructions: instructions } };
          }

          const isApex = !args.domain.includes('.') || args.domain.split('.').length === 2;
          const instructions = isApex
            ? `No Netlify DNS zone found for "${args.domain}". Set an A record pointing to 75.2.60.5, or use Netlify DNS by updating your domain's nameservers.`
            : `No Netlify DNS zone found for "${args.domain}". Set a CNAME record pointing to your site's Netlify subdomain (e.g. "my-site.netlify.app").`;
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
