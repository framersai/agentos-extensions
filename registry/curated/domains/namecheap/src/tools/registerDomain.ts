// @ts-nocheck
/**
 * @fileoverview NamecheapRegisterDomainTool — register/purchase a domain via Namecheap.
 *
 * WARNING: This tool has side effects — it will charge the Namecheap account
 * balance and register a real domain (PURCHASE operation).
 */

import type { NamecheapService, RegisterDomainResult, ContactInfo } from '../NamecheapService.js';

export interface RegisterDomainInput {
  /** The domain to register (e.g. "example.com") */
  domainName: string;
  /** Number of years to register (1-10, default: 1) */
  years?: number;
  /** Registrant contact information (required) */
  registrant: ContactInfo;
  /** Tech contact (defaults to registrant if omitted) */
  tech?: ContactInfo;
  /** Admin contact (defaults to registrant if omitted) */
  admin?: ContactInfo;
  /** AuxBilling contact (defaults to registrant if omitted) */
  auxBilling?: ContactInfo;
  /** Enable WhoisGuard privacy protection (default: true) */
  addFreeWhoisguard?: boolean;
  /** Activate WhoisGuard (default: true) */
  wgEnabled?: boolean;
  /** Custom nameservers, comma-separated (uses Namecheap defaults if omitted) */
  nameservers?: string;
}

export class NamecheapRegisterDomainTool {
  readonly id = 'namecheapRegisterDomain';
  readonly name = 'namecheapRegisterDomain';
  readonly displayName = 'Register Domain';
  readonly description = 'Register and purchase a new domain through Namecheap. Requires registrant contact information. This is a PURCHASE operation that will charge the account balance. Supports WhoisGuard privacy and custom nameservers.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domainName: { type: 'string', description: 'The domain to register (e.g. "example.com")' },
      years: { type: 'number', description: 'Number of years to register (1-10, default: 1)' },
      registrant: {
        type: 'object',
        description: 'Registrant contact info with: firstName, lastName, address1, city, stateProvince, postalCode, country, phone, emailAddress. Optional: organizationName, address2.',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          address1: { type: 'string' },
          city: { type: 'string' },
          stateProvince: { type: 'string' },
          postalCode: { type: 'string' },
          country: { type: 'string', description: 'Two-letter country code (e.g. "US", "GB")' },
          phone: { type: 'string', description: 'Phone in +CountryCode format (e.g. "+1.5555555555")' },
          emailAddress: { type: 'string' },
          organizationName: { type: 'string' },
          address2: { type: 'string' },
        },
        required: ['firstName', 'lastName', 'address1', 'city', 'stateProvince', 'postalCode', 'country', 'phone', 'emailAddress'],
      },
      tech: { type: 'object', description: 'Tech contact (same shape as registrant, defaults to registrant)' },
      admin: { type: 'object', description: 'Admin contact (same shape as registrant, defaults to registrant)' },
      auxBilling: { type: 'object', description: 'AuxBilling contact (same shape as registrant, defaults to registrant)' },
      addFreeWhoisguard: { type: 'boolean', description: 'Enable WhoisGuard privacy (default: true)' },
      wgEnabled: { type: 'boolean', description: 'Activate WhoisGuard (default: true)' },
      nameservers: { type: 'string', description: 'Custom nameservers, comma-separated (uses Namecheap defaults if omitted)' },
    },
    required: ['domainName', 'registrant'],
  };

  constructor(private service: NamecheapService) {}

  async execute(args: RegisterDomainInput): Promise<{ success: boolean; data?: RegisterDomainResult; error?: string }> {
    try {
      const result = await this.service.registerDomain({
        domainName: args.domainName,
        years: args.years,
        registrant: args.registrant,
        tech: args.tech,
        admin: args.admin,
        auxBilling: args.auxBilling,
        addFreeWhoisguard: args.addFreeWhoisguard,
        wgEnabled: args.wgEnabled,
        nameservers: args.nameservers,
      });

      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
