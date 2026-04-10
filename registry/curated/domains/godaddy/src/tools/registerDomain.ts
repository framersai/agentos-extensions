// @ts-nocheck
/**
 * @fileoverview GoDaddyRegisterDomainTool — purchase and register a domain name.
 */

import type { GoDaddyService, PurchaseResult, DomainContact } from '../GoDaddyService.js';

export interface RegisterDomainInput {
  domain: string;
  period?: number;
  autoRenew?: boolean;
  privacy?: boolean;
  contactRegistrant: DomainContact;
  contactAdmin?: DomainContact;
  contactTech?: DomainContact;
  nameServers?: string[];
}

export class GoDaddyRegisterDomainTool {
  readonly id = 'godaddyRegisterDomain';
  readonly name = 'godaddyRegisterDomain';
  readonly displayName = 'Register Domain';
  readonly description = 'Purchase and register a new domain name through GoDaddy. Requires registrant contact information. This is a PURCHASE action that will charge the account. Supports auto-renew, privacy protection, and custom nameservers.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'The domain name to register (e.g. "example.com")' },
      period: { type: 'number', description: 'Registration period in years (default: 1)' },
      autoRenew: { type: 'boolean', description: 'Enable automatic renewal (default: true)' },
      privacy: { type: 'boolean', description: 'Enable WHOIS privacy protection (default: false)' },
      contactRegistrant: {
        type: 'object',
        description: 'Registrant contact information (nameFirst, nameLast, email, phone, organization, addressMailing)',
        properties: {
          nameFirst: { type: 'string', description: 'First name' },
          nameLast: { type: 'string', description: 'Last name' },
          email: { type: 'string', description: 'Email address' },
          phone: { type: 'string', description: 'Phone number (e.g. "+1.5551234567")' },
          organization: { type: 'string', description: 'Organization name (optional)' },
          addressMailing: {
            type: 'object',
            description: 'Mailing address',
            properties: {
              address1: { type: 'string', description: 'Street address line 1' },
              address2: { type: 'string', description: 'Street address line 2 (optional)' },
              city: { type: 'string', description: 'City' },
              state: { type: 'string', description: 'State/province code' },
              postalCode: { type: 'string', description: 'Postal/zip code' },
              country: { type: 'string', description: 'Country code (e.g. "US")' },
            },
            required: ['address1', 'city', 'state', 'postalCode', 'country'],
          },
        },
        required: ['nameFirst', 'nameLast', 'email', 'phone'],
      },
      contactAdmin: { type: 'object', description: 'Admin contact (defaults to registrant if omitted)' },
      contactTech: { type: 'object', description: 'Tech contact (defaults to registrant if omitted)' },
      nameServers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Custom nameservers (optional, uses GoDaddy defaults if omitted)',
      },
    },
    required: ['domain', 'contactRegistrant'],
  };

  constructor(private service: GoDaddyService) {}

  async execute(args: RegisterDomainInput): Promise<{ success: boolean; data?: PurchaseResult; error?: string }> {
    try {
      const result = await this.service.purchaseDomain({
        domain: args.domain,
        period: args.period,
        autoRenew: args.autoRenew,
        privacy: args.privacy,
        contactRegistrant: args.contactRegistrant,
        contactAdmin: args.contactAdmin,
        contactTech: args.contactTech,
        nameServers: args.nameServers,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
