// @ts-nocheck
/**
 * @fileoverview GoDaddy REST API service layer.
 *
 * Wraps the GoDaddy API v1 for domain search, registration, DNS management,
 * and domain detail retrieval. Supports both production and OTE (sandbox)
 * environments.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoDaddyConfig {
  /** GoDaddy API key (from https://developer.godaddy.com/keys) */
  apiKey: string;
  /** GoDaddy API secret */
  apiSecret: string;
  /** API base URL (defaults to https://api.godaddy.com/v1, use https://api.ote-godaddy.com/v1 for sandbox) */
  baseUrl?: string;
}

export interface DomainAvailability {
  available: boolean;
  domain: string;
  definitive: boolean;
  price: number;
  currency: string;
  period: number;
}

export interface DomainSummary {
  domain: string;
  domainId: number;
  status: string;
  expires: string;
  createdAt: string;
  renewable: boolean;
  autoRenew: boolean;
  locked: boolean;
  nameServers: string[] | null;
}

export interface DomainDetail {
  domain: string;
  domainId: number;
  status: string;
  expires: string;
  createdAt: string;
  modifiedAt: string;
  renewable: boolean;
  autoRenew: boolean;
  locked: boolean;
  nameServers: string[];
  contactRegistrant?: DomainContact;
  contactAdmin?: DomainContact;
  contactTech?: DomainContact;
}

export interface DomainContact {
  nameFirst: string;
  nameLast: string;
  email: string;
  phone: string;
  organization?: string;
  addressMailing?: {
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export interface DnsRecord {
  type: string;
  name: string;
  data: string;
  ttl: number;
  priority?: number;
  port?: number;
  weight?: number;
  protocol?: string;
  service?: string;
}

export interface DomainPurchaseRequest {
  domain: string;
  /** Registration period in years (default: 1) */
  period?: number;
  /** Enable auto-renew (default: true) */
  autoRenew?: boolean;
  /** Enable privacy protection (default: false) */
  privacy?: boolean;
  /** Registrant contact info */
  contactRegistrant: DomainContact;
  /** Admin contact (defaults to registrant) */
  contactAdmin?: DomainContact;
  /** Tech contact (defaults to registrant) */
  contactTech?: DomainContact;
  /** Nameservers to set (optional) */
  nameServers?: string[];
}

export interface PurchaseResult {
  orderId: number;
  itemCount: number;
  total: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GoDaddyService {
  private config: GoDaddyConfig;
  private running = false;

  constructor(config: GoDaddyConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.godaddy.com/v1',
    };
  }

  async initialize(): Promise<void> {
    // Validate credentials by listing domains with a small limit
    const res = await this.fetch('/domains?limit=1');
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GoDaddy auth failed: ${res.status} ${body}`);
    }
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // -- Domain Availability --------------------------------------------------

  /** Check availability for a single domain. */
  async checkAvailability(domain: string): Promise<DomainAvailability> {
    const res = await this.fetch(`/domains/available?domain=${encodeURIComponent(domain)}`);
    const data = await this.json(res);
    return {
      available: data.available ?? false,
      domain: data.domain ?? domain,
      definitive: data.definitive ?? false,
      price: data.price ?? 0,
      currency: data.currency ?? 'USD',
      period: data.period ?? 1,
    };
  }

  // -- Domain Registration --------------------------------------------------

  /** Purchase / register a domain. */
  async purchaseDomain(req: DomainPurchaseRequest): Promise<PurchaseResult> {
    const body: Record<string, unknown> = {
      domain: req.domain,
      consent: {
        agreedAt: new Date().toISOString(),
        agreedBy: req.contactRegistrant.email,
        agreementKeys: ['DNRA'],
      },
      period: req.period ?? 1,
      renewAuto: req.autoRenew ?? true,
      privacy: req.privacy ?? false,
      contactRegistrant: req.contactRegistrant,
      contactAdmin: req.contactAdmin ?? req.contactRegistrant,
      contactTech: req.contactTech ?? req.contactRegistrant,
    };

    if (req.nameServers && req.nameServers.length > 0) {
      body.nameServers = req.nameServers;
    }

    const res = await this.fetch('/domains/purchase', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return {
      orderId: data.orderId ?? 0,
      itemCount: data.itemCount ?? 1,
      total: data.total ?? 0,
      currency: data.currency ?? 'USD',
    };
  }

  // -- Domain Listing -------------------------------------------------------

  /** List all domains in the account. */
  async listDomains(limit = 100, marker?: string): Promise<DomainSummary[]> {
    let path = `/domains?limit=${limit}`;
    if (marker) path += `&marker=${encodeURIComponent(marker)}`;

    const res = await this.fetch(path);
    const data = await this.json(res);
    return (Array.isArray(data) ? data : []).map((d: any) => this.mapDomainSummary(d));
  }

  // -- Domain Details -------------------------------------------------------

  /** Get detailed information about a domain. */
  async getDomainDetail(domain: string): Promise<DomainDetail> {
    const res = await this.fetch(`/domains/${encodeURIComponent(domain)}`);
    const data = await this.json(res);
    return this.mapDomainDetail(data);
  }

  // -- DNS Records ----------------------------------------------------------

  /** Get all DNS records for a domain. */
  async getDnsRecords(domain: string): Promise<DnsRecord[]> {
    const res = await this.fetch(`/domains/${encodeURIComponent(domain)}/records`);
    const data = await this.json(res);
    return (Array.isArray(data) ? data : []).map((r: any) => this.mapDnsRecord(r));
  }

  /** Get DNS records by type (e.g. 'A', 'CNAME', 'MX', 'TXT'). */
  async getDnsRecordsByType(domain: string, type: string): Promise<DnsRecord[]> {
    const res = await this.fetch(
      `/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(type)}`,
    );
    const data = await this.json(res);
    return (Array.isArray(data) ? data : []).map((r: any) => this.mapDnsRecord(r));
  }

  /** Replace all DNS records of a given type and name. */
  async replaceDnsRecords(
    domain: string,
    type: string,
    name: string,
    records: Omit<DnsRecord, 'type' | 'name'>[],
  ): Promise<void> {
    const body = records.map((r) => ({
      data: r.data,
      ttl: r.ttl ?? 3600,
      ...(r.priority !== undefined ? { priority: r.priority } : {}),
      ...(r.port !== undefined ? { port: r.port } : {}),
      ...(r.weight !== undefined ? { weight: r.weight } : {}),
      ...(r.protocol !== undefined ? { protocol: r.protocol } : {}),
      ...(r.service !== undefined ? { service: r.service } : {}),
    }));

    const res = await this.fetch(
      `/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(type)}/${encodeURIComponent(name)}`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GoDaddy API ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  /** Add DNS records to a domain (appends, does not replace). */
  async addDnsRecords(domain: string, records: DnsRecord[]): Promise<void> {
    const res = await this.fetch(
      `/domains/${encodeURIComponent(domain)}/records`,
      { method: 'PATCH', body: JSON.stringify(records) },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GoDaddy API ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  /** Delete all DNS records of a given type and name. */
  async deleteDnsRecords(domain: string, type: string, name: string): Promise<void> {
    const res = await this.fetch(
      `/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(type)}/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GoDaddy API ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  // -- Helpers --------------------------------------------------------------

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    return globalThis.fetch(url, {
      ...init,
      headers: {
        'Authorization': `sso-key ${this.config.apiKey}:${this.config.apiSecret}`,
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> ?? {}),
      },
    });
  }

  private async json(res: Response): Promise<any> {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GoDaddy API ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
  }

  private mapDomainSummary(data: any): DomainSummary {
    return {
      domain: data.domain ?? '',
      domainId: data.domainId ?? 0,
      status: data.status ?? 'UNKNOWN',
      expires: data.expires ?? '',
      createdAt: data.createdAt ?? '',
      renewable: data.renewable ?? false,
      autoRenew: data.renewAuto ?? false,
      locked: data.locked ?? false,
      nameServers: data.nameServers ?? null,
    };
  }

  private mapDomainDetail(data: any): DomainDetail {
    return {
      domain: data.domain ?? '',
      domainId: data.domainId ?? 0,
      status: data.status ?? 'UNKNOWN',
      expires: data.expires ?? '',
      createdAt: data.createdAt ?? '',
      modifiedAt: data.modifiedAt ?? '',
      renewable: data.renewable ?? false,
      autoRenew: data.renewAuto ?? false,
      locked: data.locked ?? false,
      nameServers: data.nameServers ?? [],
      contactRegistrant: data.contactRegistrant,
      contactAdmin: data.contactAdmin,
      contactTech: data.contactTech,
    };
  }

  private mapDnsRecord(data: any): DnsRecord {
    return {
      type: data.type ?? '',
      name: data.name ?? '',
      data: data.data ?? '',
      ttl: data.ttl ?? 3600,
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.port !== undefined ? { port: data.port } : {}),
      ...(data.weight !== undefined ? { weight: data.weight } : {}),
      ...(data.protocol !== undefined ? { protocol: data.protocol } : {}),
      ...(data.service !== undefined ? { service: data.service } : {}),
    };
  }
}
