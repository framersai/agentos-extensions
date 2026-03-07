/**
 * @fileoverview Cloudflare Registrar + DNS service layer.
 *
 * Wraps the Cloudflare API v4 for domain registrar operations (list, inspect,
 * update settings, transfer) and zone-based DNS record management.
 *
 * Auth: Bearer token via `Authorization: Bearer {apiToken}`.
 * Docs: https://developers.cloudflare.com/api
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CloudflareRegistrarConfig {
  /** Cloudflare API token (scoped to Account and Zone permissions) */
  apiToken: string;
  /** Cloudflare Account ID */
  accountId: string;
  /** API base URL (defaults to https://api.cloudflare.com/client/v4) */
  baseUrl?: string;
}

export interface RegisteredDomain {
  domain: string;
  status: string;
  expiresAt: string;
  autoRenew: boolean;
  locked: boolean;
  privacy: boolean;
  registrant?: string;
  createdAt?: string;
  updatedAt?: string;
  nameservers?: string[];
}

export interface DomainDetail extends RegisteredDomain {
  transferIn?: {
    status: string;
    acceptFoa?: string;
    canCancelTransfer?: boolean;
  };
  registryStatuses?: string[];
  fees?: {
    registrationFee?: number;
    renewalFee?: number;
    transferFee?: number;
  };
}

export interface DomainSettingsUpdate {
  autoRenew?: boolean;
  locked?: boolean;
  privacy?: boolean;
}

export interface DnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
  comment?: string;
  createdOn?: string;
  modifiedOn?: string;
}

export interface DnsRecordInput {
  name: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV' | 'CAA';
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  comment?: string;
}

export interface TransferDomainResult {
  domain: string;
  status: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CloudflareRegistrarService {
  private config: CloudflareRegistrarConfig;
  private running = false;

  constructor(config: CloudflareRegistrarConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.cloudflare.com/client/v4',
    };
  }

  async initialize(): Promise<void> {
    // Validate auth by verifying the token
    const res = await this.get('/user/tokens/verify');
    if (res.success !== true) {
      throw new Error(
        `Cloudflare auth failed: ${res.errors?.[0]?.message ?? JSON.stringify(res)}`,
      );
    }
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // -- Registrar: Domain Listing --------------------------------------------

  /** List all domains registered via Cloudflare Registrar on the account. */
  async listDomains(): Promise<RegisteredDomain[]> {
    const res = await this.get(
      `/accounts/${this.config.accountId}/registrar/domains`,
    );
    return (res.result ?? []).map((d: any) => this.mapDomain(d));
  }

  // -- Registrar: Domain Details --------------------------------------------

  /** Get detailed registrar information for a single domain. */
  async getDomainInfo(domain: string): Promise<DomainDetail> {
    const res = await this.get(
      `/accounts/${this.config.accountId}/registrar/domains/${domain}`,
    );
    const d = res.result ?? {};
    return {
      ...this.mapDomain(d),
      transferIn: d.transfer_in
        ? {
            status: d.transfer_in.transfer_status ?? '',
            acceptFoa: d.transfer_in.accept_foa,
            canCancelTransfer: d.transfer_in.can_cancel_transfer,
          }
        : undefined,
      registryStatuses: d.registry_statuses,
      fees: d.fees
        ? {
            registrationFee: d.fees.registration_fee,
            renewalFee: d.fees.renewal_fee,
            transferFee: d.fees.transfer_fee,
          }
        : undefined,
    };
  }

  // -- Registrar: Update Settings -------------------------------------------

  /** Update registrar settings (auto_renew, locked, privacy) for a domain. */
  async updateDomainSettings(
    domain: string,
    settings: DomainSettingsUpdate,
  ): Promise<DomainDetail> {
    const body: Record<string, unknown> = {};
    if (settings.autoRenew !== undefined) body.auto_renew = settings.autoRenew;
    if (settings.locked !== undefined) body.locked = settings.locked;
    if (settings.privacy !== undefined) body.privacy = settings.privacy;

    const res = await this.put(
      `/accounts/${this.config.accountId}/registrar/domains/${domain}`,
      body,
    );
    const d = res.result ?? {};
    return {
      ...this.mapDomain(d),
      transferIn: d.transfer_in
        ? {
            status: d.transfer_in.transfer_status ?? '',
            acceptFoa: d.transfer_in.accept_foa,
            canCancelTransfer: d.transfer_in.can_cancel_transfer,
          }
        : undefined,
      registryStatuses: d.registry_statuses,
    };
  }

  // -- Registrar: Transfer In -----------------------------------------------

  /** Initiate a domain transfer to Cloudflare. */
  async transferDomain(
    domain: string,
    authCode: string,
  ): Promise<TransferDomainResult> {
    const res = await this.post(
      `/accounts/${this.config.accountId}/registrar/domains/${domain}/transfer`,
      { auth_code: authCode },
    );
    return {
      domain,
      status: res.success ? 'INITIATED' : 'FAILED',
      message:
        res.success
          ? `Domain transfer for ${domain} initiated successfully.`
          : `Domain transfer for ${domain} failed: ${res.errors?.[0]?.message ?? 'unknown error'}.`,
    };
  }

  // -- DNS: Zone Lookup -----------------------------------------------------

  /** Find the zone ID for a domain name. */
  async findZoneId(domain: string): Promise<string> {
    const res = await this.get(`/zones?name=${encodeURIComponent(domain)}`);
    const zones = res.result ?? [];
    if (zones.length === 0) {
      throw new Error(
        `No Cloudflare zone found for "${domain}". Ensure the domain is added to your Cloudflare account.`,
      );
    }
    return zones[0].id;
  }

  // -- DNS: Record Management -----------------------------------------------

  /** List all DNS records for a zone. */
  async listDnsRecords(zoneId: string): Promise<DnsRecord[]> {
    const res = await this.get(`/zones/${zoneId}/dns_records`);
    return (res.result ?? []).map((r: any) => this.mapDnsRecord(r));
  }

  /** Create a DNS record in a zone. */
  async createDnsRecord(
    zoneId: string,
    record: DnsRecordInput,
  ): Promise<DnsRecord> {
    const body: Record<string, unknown> = {
      name: record.name,
      type: record.type,
      content: record.content,
      ttl: record.ttl ?? 1, // 1 = automatic in Cloudflare
    };
    if (record.priority !== undefined) body.priority = record.priority;
    if (record.proxied !== undefined) body.proxied = record.proxied;
    if (record.comment) body.comment = record.comment;

    const res = await this.post(`/zones/${zoneId}/dns_records`, body);
    return this.mapDnsRecord(res.result ?? {});
  }

  /** Update an existing DNS record. */
  async updateDnsRecord(
    zoneId: string,
    recordId: string,
    record: Partial<DnsRecordInput>,
  ): Promise<DnsRecord> {
    const body: Record<string, unknown> = {};
    if (record.name !== undefined) body.name = record.name;
    if (record.type !== undefined) body.type = record.type;
    if (record.content !== undefined) body.content = record.content;
    if (record.ttl !== undefined) body.ttl = record.ttl;
    if (record.priority !== undefined) body.priority = record.priority;
    if (record.proxied !== undefined) body.proxied = record.proxied;
    if (record.comment !== undefined) body.comment = record.comment;

    const res = await this.put(
      `/zones/${zoneId}/dns_records/${recordId}`,
      body,
    );
    return this.mapDnsRecord(res.result ?? {});
  }

  /** Delete a DNS record from a zone. */
  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    await this.delete(`/zones/${zoneId}/dns_records/${recordId}`);
  }

  // -- HTTP Helpers ---------------------------------------------------------

  private async get(path: string): Promise<any> {
    return this.request('GET', path);
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<any> {
    return this.request('POST', path, body);
  }

  private async put(
    path: string,
    body: Record<string, unknown>,
  ): Promise<any> {
    return this.request('PUT', path, body);
  }

  private async delete(path: string): Promise<any> {
    return this.request('DELETE', path);
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<any> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiToken}`,
      'Content-Type': 'application/json',
    };

    const init: RequestInit = { method, headers };
    if (body) init.body = JSON.stringify(body);

    const res = await globalThis.fetch(url, init);
    return this.handleResponse(res);
  }

  /** Parse response JSON, throwing on HTTP or API errors. */
  private async handleResponse(res: Response): Promise<any> {
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Cloudflare API ${res.status}: invalid JSON — ${text.slice(0, 500)}`,
      );
    }

    if (!res.ok) {
      const msg =
        data.errors?.[0]?.message ?? data.message ?? text.slice(0, 500);
      throw new Error(`Cloudflare API ${res.status}: ${msg}`);
    }

    if (data.success === false) {
      const msg = data.errors?.[0]?.message ?? 'unknown error';
      throw new Error(`Cloudflare API error: ${msg}`);
    }

    return data;
  }

  // -- Mapping Helpers ------------------------------------------------------

  private mapDomain(d: any): RegisteredDomain {
    return {
      domain: d.domain_name ?? d.name ?? '',
      status: d.status ?? '',
      expiresAt: d.expires_at ?? d.expiry_date ?? '',
      autoRenew: d.auto_renew === true,
      locked: d.locked === true,
      privacy: d.privacy === true,
      registrant: d.registrant_contact?.organization ?? d.registrant ?? undefined,
      createdAt: d.created_at ?? undefined,
      updatedAt: d.updated_at ?? undefined,
      nameservers: d.name_servers ?? undefined,
    };
  }

  private mapDnsRecord(r: any): DnsRecord {
    return {
      id: r.id ?? '',
      name: r.name ?? '',
      type: r.type ?? '',
      content: r.content ?? '',
      ttl: r.ttl ?? 1,
      proxied: r.proxied === true,
      priority: r.priority ?? undefined,
      comment: r.comment ?? undefined,
      createdOn: r.created_on ?? undefined,
      modifiedOn: r.modified_on ?? undefined,
    };
  }
}
