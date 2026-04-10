// @ts-nocheck
/**
 * @fileoverview PorkbunRegisterDomainTool — register (purchase) a domain through Porkbun.
 */

import type { PorkbunService, RegisterDomainResult } from '../PorkbunService.js';

export interface RegisterDomainInput {
  domain: string;
  years?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  organization?: string;
  address?: string;
}

export class PorkbunRegisterDomainTool {
  readonly id = 'porkbunRegisterDomain';
  readonly name = 'porkbunRegisterDomain';
  readonly displayName = 'Register Domain';
  readonly description = 'Register and purchase a domain through Porkbun. WARNING: This is a REAL PURCHASE that will charge the payment method on file in the connected Porkbun account. The domain will be registered for the specified number of years (default: 1). Contact fields are optional — Porkbun uses account defaults if omitted.';
  readonly category = 'domain';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: 'The domain name to register (e.g. "example.com")' },
      years: { type: 'number', description: 'Number of years to register (default: 1, max: 10)' },
      firstName: { type: 'string', description: 'Registrant first name (uses account default if omitted)' },
      lastName: { type: 'string', description: 'Registrant last name (uses account default if omitted)' },
      email: { type: 'string', description: 'Registrant email (uses account default if omitted)' },
      phone: { type: 'string', description: 'Registrant phone number (uses account default if omitted)' },
      city: { type: 'string', description: 'Registrant city (uses account default if omitted)' },
      state: { type: 'string', description: 'Registrant state/province (uses account default if omitted)' },
      zip: { type: 'string', description: 'Registrant postal code (uses account default if omitted)' },
      country: { type: 'string', description: 'Registrant country code, e.g. "US" (uses account default if omitted)' },
      organization: { type: 'string', description: 'Registrant organization (optional)' },
      address: { type: 'string', description: 'Registrant street address (uses account default if omitted)' },
    },
    required: ['domain'],
  };

  constructor(private service: PorkbunService) {}

  async execute(args: RegisterDomainInput): Promise<{ success: boolean; data?: RegisterDomainResult; error?: string }> {
    try {
      const result = await this.service.registerDomain({
        domain: args.domain,
        years: args.years,
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        phone: args.phone,
        city: args.city,
        state: args.state,
        zip: args.zip,
        country: args.country,
        organization: args.organization,
        address: args.address,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
