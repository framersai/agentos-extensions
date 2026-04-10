// @ts-nocheck
/**
 * @fileoverview Porkbun API v3 service layer.
 *
 * Wraps the Porkbun REST API for domain registration, availability checks,
 * DNS record management, and domain transfers.
 *
 * NOTE: Porkbun uses POST for ALL endpoints and requires apikey + secretapikey
 * in every request body.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PorkbunConfig {
  /** Porkbun API key (from https://porkbun.com/account/api) */
  apiKey: string;
  /** Porkbun secret API key */
  secretApiKey: string;
  /** API base URL (defaults to https://api.porkbun.com/api/json/v3) */
  baseUrl?: string;
}

export interface DomainAvailability {
  domain: string;
  available: boolean;
  pricing?: DomainPricing;
}

export interface DomainPricing {
  registration: string;
  renewal: string;
  transfer: string;
  couponed?: string;
}

export interface OwnedDomain {
  domain: string;
  status: string;
  tld: string;
  createDate: string;
  expireDate: string;
  securityLock: boolean;
  whoisPrivacy: boolean;
  autoRenew: boolean;
  notLocal: boolean;
}

export interface DnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: string;
  prio: string | null;
  notes: string | null;
}

export interface RegisterDomainOptions {
  domain: string;
  years?: number;
  /** Registrant contact fields (optional — Porkbun uses account defaults) */
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

export interface RegisterDomainResult {
  domain: string;
  status: string;
  message: string;
}

export interface DnsRecordInput {
  name?: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV' | 'TLSA' | 'CAA' | 'ALIAS';
  content: string;
  ttl?: string;
  prio?: string;
}

export interface TransferDomainResult {
  domain: string;
  status: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PorkbunService {
  private config: PorkbunConfig;
  private running = false;

  constructor(config: PorkbunConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.porkbun.com/api/json/v3',
    };
  }

  async initialize(): Promise<void> {
    // Validate auth by pinging the API
    const res = await this.post('/ping', {});
    if (res.status !== 'SUCCESS') {
      throw new Error(`Porkbun auth failed: ${res.message ?? JSON.stringify(res)}`);
    }
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Domain Availability ─────────────────────────────────────────────────

  /** Check if a domain is available for registration. */
  async checkAvailability(domain: string): Promise<DomainAvailability> {
    const res = await this.post('/domain/checkAvailability', { domain });
    const available = res.avail === true || res.avail === 'true' || res.status === 'SUCCESS';

    let pricing: DomainPricing | undefined;
    // Also fetch pricing if available
    try {
      pricing = await this.getPricing(domain);
    } catch {
      // Pricing may fail for unavailable domains — that's okay
    }

    return {
      domain,
      available,
      pricing,
    };
  }

  /** Get pricing information for a domain/TLD. */
  async getPricing(domain: string): Promise<DomainPricing> {
    const res = await this.post('/domain/pricing/get', { domain });
    const p = res.pricing ?? res;
    return {
      registration: p.registration ?? p.register ?? '',
      renewal: p.renewal ?? p.renew ?? '',
      transfer: p.transfer ?? '',
      couponed: p.couponed,
    };
  }

  // ── Domain Registration ─────────────────────────────────────────────────

  /** Register (purchase) a domain. */
  async registerDomain(opts: RegisterDomainOptions): Promise<RegisterDomainResult> {
    const body: Record<string, unknown> = {
      domain: opts.domain,
      years: opts.years ?? 1,
    };

    // Add optional contact fields
    if (opts.firstName) body.firstName = opts.firstName;
    if (opts.lastName) body.lastName = opts.lastName;
    if (opts.email) body.email = opts.email;
    if (opts.phone) body.phone = opts.phone;
    if (opts.city) body.city = opts.city;
    if (opts.state) body.stateProvince = opts.state;
    if (opts.zip) body.zip = opts.zip;
    if (opts.country) body.country = opts.country;
    if (opts.organization) body.organization = opts.organization;
    if (opts.address) body.addressLine1 = opts.address;

    const res = await this.post('/domain/register', body);
    return {
      domain: opts.domain,
      status: res.status ?? 'UNKNOWN',
      message: res.message ?? `Domain ${opts.domain} registration ${res.status === 'SUCCESS' ? 'successful' : 'failed'}.`,
    };
  }

  // ── Domain Listing ──────────────────────────────────────────────────────

  /** List all domains owned by the account. */
  async listDomains(): Promise<OwnedDomain[]> {
    const res = await this.post('/domain/listAll', {});
    return (res.domains ?? []).map((d: any) => ({
      domain: d.domain ?? '',
      status: d.status ?? '',
      tld: d.tld ?? '',
      createDate: d.createDate ?? '',
      expireDate: d.expireDate ?? '',
      securityLock: d.securityLock === '1' || d.securityLock === true,
      whoisPrivacy: d.whoisPrivacy === '1' || d.whoisPrivacy === true,
      autoRenew: d.autoRenew === '1' || d.autoRenew === true,
      notLocal: d.notLocal === '1' || d.notLocal === true,
    }));
  }

  // ── DNS Management ──────────────────────────────────────────────────────

  /** Create a DNS record for a domain. */
  async createDnsRecord(domain: string, record: DnsRecordInput): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      name: record.name ?? '',
      type: record.type,
      content: record.content,
      ttl: record.ttl ?? '300',
    };
    if (record.prio) body.prio = record.prio;

    const res = await this.post(`/dns/create/${domain}`, body);
    return { id: String(res.id ?? '') };
  }

  /** Edit an existing DNS record. */
  async editDnsRecord(domain: string, recordId: string, record: Partial<DnsRecordInput>): Promise<void> {
    const body: Record<string, unknown> = {};
    if (record.name !== undefined) body.name = record.name;
    if (record.type) body.type = record.type;
    if (record.content) body.content = record.content;
    if (record.ttl) body.ttl = record.ttl;
    if (record.prio) body.prio = record.prio;

    await this.post(`/dns/edit/${domain}/${recordId}`, body);
  }

  /** Delete a DNS record. */
  async deleteDnsRecord(domain: string, recordId: string): Promise<void> {
    await this.post(`/dns/delete/${domain}/${recordId}`, {});
  }

  /** List all DNS records for a domain. */
  async listDnsRecords(domain: string): Promise<DnsRecord[]> {
    const res = await this.post(`/dns/retrieve/${domain}`, {});
    return (res.records ?? []).map((r: any) => this.mapDnsRecord(r));
  }

  /** Retrieve DNS records by name and type. */
  async getDnsRecordsByNameType(domain: string, type: string, subdomain?: string): Promise<DnsRecord[]> {
    const sub = subdomain ?? '';
    const res = await this.post(`/dns/retrieveByNameType/${domain}/${type}/${sub}`, {});
    return (res.records ?? []).map((r: any) => this.mapDnsRecord(r));
  }

  // ── Domain Transfer ─────────────────────────────────────────────────────

  /** Initiate a domain transfer to Porkbun. */
  async transferDomain(domain: string, authCode: string): Promise<TransferDomainResult> {
    const res = await this.post('/domain/transfer', {
      domain,
      authCode,
    });
    return {
      domain,
      status: res.status ?? 'UNKNOWN',
      message: res.message ?? `Domain transfer for ${domain} ${res.status === 'SUCCESS' ? 'initiated' : 'failed'}.`,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * POST helper — all Porkbun endpoints are POST and require
   * apikey + secretapikey in the body.
   */
  private async post(path: string, body: Record<string, unknown>): Promise<any> {
    const url = `${this.config.baseUrl}${path}`;
    const payload = {
      apikey: this.config.apiKey,
      secretapikey: this.config.secretApiKey,
      ...body,
    };

    const res = await globalThis.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return this.handleResponse(res);
  }

  /** Parse the response JSON, throwing on HTTP errors. */
  private async handleResponse(res: Response): Promise<any> {
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Porkbun API ${res.status}: invalid JSON — ${text.slice(0, 500)}`);
    }

    if (!res.ok) {
      throw new Error(
        `Porkbun API ${res.status}: ${data.message ?? text.slice(0, 500)}`,
      );
    }

    if (data.status === 'ERROR') {
      throw new Error(`Porkbun API error: ${data.message ?? 'unknown error'}`);
    }

    return data;
  }

  private mapDnsRecord(r: any): DnsRecord {
    return {
      id: String(r.id ?? ''),
      name: r.name ?? '',
      type: r.type ?? '',
      content: r.content ?? '',
      ttl: String(r.ttl ?? '300'),
      prio: r.prio ? String(r.prio) : null,
      notes: r.notes ?? null,
    };
  }
}
