/**
 * @fileoverview Linode REST API service layer.
 *
 * Wraps the Linode API v4 for instance provisioning, StackScript deployment,
 * DNS zone/record management, NodeBalancer creation, and infrastructure queries.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinodeConfig {
  /** Linode API token (from https://cloud.linode.com/profile/tokens) */
  token: string;
  /** API base URL (defaults to https://api.linode.com/v4) */
  baseUrl?: string;
}

export interface LinodeInstance {
  id: number;
  label: string;
  status: 'running' | 'offline' | 'booting' | 'rebooting' | 'shutting_down' | 'provisioning' | 'deleting' | 'migrating' | 'rebuilding' | 'cloning' | 'restoring' | 'stopped';
  type: string;
  region: string;
  image: string | null;
  ipv4: string[];
  ipv6: string | null;
  created: string;
  updated: string;
  tags: string[];
  specs: {
    disk: number;
    memory: number;
    vcpus: number;
    transfer: number;
  };
}

export interface LinodeCreateOptions {
  /** Region slug (e.g. "us-east") */
  region: string;
  /** Instance type/plan (e.g. "g6-nanode-1") */
  type: string;
  /** Image ID (e.g. "linode/ubuntu22.04") */
  image: string;
  /** Human-readable label */
  label?: string;
  /** Root password */
  root_pass: string;
  /** StackScript ID for automated provisioning */
  stackscript_id?: number;
  /** StackScript user-defined fields (key-value) */
  stackscript_data?: Record<string, string>;
  /** Tags for organizing instances */
  tags?: string[];
  /** Authorized SSH keys */
  authorized_keys?: string[];
  /** Whether to enable backups */
  backups_enabled?: boolean;
  /** Whether to use a private IP */
  private_ip?: boolean;
}

export interface LinodeDomain {
  id: number;
  domain: string;
  type: 'master' | 'slave';
  status: 'active' | 'disabled' | 'edit_mode' | 'has_errors';
  soa_email: string;
  description: string;
  tags: string[];
  created: string;
  updated: string;
}

export interface LinodeDomainRecord {
  id: number;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'NS' | 'CAA' | 'PTR';
  name: string;
  target: string;
  priority?: number;
  weight?: number;
  port?: number;
  ttl_sec: number;
  tag?: string;
}

export interface LinodeType {
  id: string;
  label: string;
  price: { hourly: number; monthly: number };
  memory: number;
  disk: number;
  vcpus: number;
  transfer: number;
  class: 'nanode' | 'standard' | 'dedicated' | 'gpu' | 'highmem' | 'premium';
}

export interface LinodeRegion {
  id: string;
  label: string;
  country: string;
  capabilities: string[];
  status: 'ok' | 'outage';
}

export interface LinodeNodeBalancer {
  id: number;
  label: string;
  region: string;
  hostname: string;
  ipv4: string;
  ipv6: string | null;
  client_conn_throttle: number;
  tags: string[];
  created: string;
  updated: string;
  transfer: { in: number; out: number; total: number };
}

export interface NodeBalancerConfigOptions {
  /** Port the NodeBalancer listens on (default: 80) */
  port?: number;
  /** Protocol: http, https, tcp */
  protocol?: 'http' | 'https' | 'tcp';
  /** Load balancing algorithm */
  algorithm?: 'roundrobin' | 'leastconn' | 'source';
  /** Health check type */
  check?: 'none' | 'connection' | 'http' | 'http_body';
  /** Health check interval in seconds */
  check_interval?: number;
  /** Health check timeout in seconds */
  check_timeout?: number;
  /** Health check attempts before marking unhealthy */
  check_attempts?: number;
  /** Health check path (for HTTP checks) */
  check_path?: string;
  /** Stickiness: none, table, http_cookie */
  stickiness?: 'none' | 'table' | 'http_cookie';
}

export interface NodeBalancerNode {
  /** Backend IP address and port (e.g. "192.168.1.1:80") */
  address: string;
  /** Human-readable label */
  label: string;
  /** Weight for load balancing (1-255) */
  weight?: number;
  /** Mode: accept, reject, drain, backup */
  mode?: 'accept' | 'reject' | 'drain' | 'backup';
}

// ---------------------------------------------------------------------------
// Paginated response
// ---------------------------------------------------------------------------

interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pages: number;
  results: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LinodeService {
  private config: LinodeConfig;
  private running = false;

  constructor(config: LinodeConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.linode.com/v4',
    };
  }

  async initialize(): Promise<void> {
    // Validate token by fetching account info
    const res = await this.fetch('/account');
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Linode auth failed: ${res.status} ${body}`);
    }
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Instances ───────────────────────────────────────────────────────────

  /** Create a new Linode instance. */
  async createInstance(opts: LinodeCreateOptions): Promise<LinodeInstance> {
    const body: Record<string, unknown> = {
      region: opts.region,
      type: opts.type,
      image: opts.image,
      root_pass: opts.root_pass,
    };
    if (opts.label) body.label = opts.label;
    if (opts.stackscript_id) body.stackscript_id = opts.stackscript_id;
    if (opts.stackscript_data) body.stackscript_data = opts.stackscript_data;
    if (opts.tags) body.tags = opts.tags;
    if (opts.authorized_keys) body.authorized_keys = opts.authorized_keys;
    if (opts.backups_enabled !== undefined) body.backups_enabled = opts.backups_enabled;
    if (opts.private_ip !== undefined) body.private_ip = opts.private_ip;

    const res = await this.fetch('/linode/instances', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return this.mapInstance(data);
  }

  /** List all Linode instances. */
  async listInstances(page = 1, pageSize = 100): Promise<{ instances: LinodeInstance[]; total: number }> {
    const res = await this.fetch(`/linode/instances?page=${page}&page_size=${pageSize}`);
    const data: PaginatedResponse<any> = await this.json(res);
    return {
      instances: data.data.map((d: any) => this.mapInstance(d)),
      total: data.results,
    };
  }

  /** Get a single Linode instance by ID. */
  async getInstance(id: number): Promise<LinodeInstance> {
    const res = await this.fetch(`/linode/instances/${id}`);
    const data = await this.json(res);
    return this.mapInstance(data);
  }

  /** Delete a Linode instance. */
  async deleteInstance(id: number): Promise<void> {
    const res = await this.fetch(`/linode/instances/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Linode API ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  /** Boot a Linode instance. */
  async bootInstance(id: number): Promise<void> {
    const res = await this.fetch(`/linode/instances/${id}/boot`, { method: 'POST' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Linode API ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  /** Shutdown a Linode instance. */
  async shutdownInstance(id: number): Promise<void> {
    const res = await this.fetch(`/linode/instances/${id}/shutdown`, { method: 'POST' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Linode API ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  // ── DNS (Domains) ─────────────────────────────────────────────────────

  /** Create a domain zone. */
  async createDomain(domain: string, soaEmail: string, opts?: {
    type?: 'master' | 'slave';
    description?: string;
    tags?: string[];
  }): Promise<LinodeDomain> {
    const body: Record<string, unknown> = {
      domain,
      type: opts?.type ?? 'master',
      soa_email: soaEmail,
    };
    if (opts?.description) body.description = opts.description;
    if (opts?.tags) body.tags = opts.tags;

    const res = await this.fetch('/domains', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return this.mapDomain(data);
  }

  /** List all domain zones. */
  async listDomains(page = 1, pageSize = 100): Promise<{ domains: LinodeDomain[]; total: number }> {
    const res = await this.fetch(`/domains?page=${page}&page_size=${pageSize}`);
    const data: PaginatedResponse<any> = await this.json(res);
    return {
      domains: data.data.map((d: any) => this.mapDomain(d)),
      total: data.results,
    };
  }

  /** Create a DNS record in a domain zone. */
  async createDomainRecord(domainId: number, record: {
    type: LinodeDomainRecord['type'];
    name: string;
    target: string;
    priority?: number;
    weight?: number;
    port?: number;
    ttl_sec?: number;
    tag?: string;
  }): Promise<LinodeDomainRecord> {
    const res = await this.fetch(`/domains/${domainId}/records`, {
      method: 'POST',
      body: JSON.stringify(record),
    });
    const data = await this.json(res);
    return this.mapDomainRecord(data);
  }

  /** List DNS records for a domain zone. */
  async listDomainRecords(domainId: number, page = 1, pageSize = 100): Promise<{ records: LinodeDomainRecord[]; total: number }> {
    const res = await this.fetch(`/domains/${domainId}/records?page=${page}&page_size=${pageSize}`);
    const data: PaginatedResponse<any> = await this.json(res);
    return {
      records: data.data.map((d: any) => this.mapDomainRecord(d)),
      total: data.results,
    };
  }

  /** Update a DNS record. */
  async updateDomainRecord(domainId: number, recordId: number, updates: Partial<{
    type: LinodeDomainRecord['type'];
    name: string;
    target: string;
    priority: number;
    weight: number;
    port: number;
    ttl_sec: number;
    tag: string;
  }>): Promise<LinodeDomainRecord> {
    const res = await this.fetch(`/domains/${domainId}/records/${recordId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    const data = await this.json(res);
    return this.mapDomainRecord(data);
  }

  /** Delete a DNS record. */
  async deleteDomainRecord(domainId: number, recordId: number): Promise<void> {
    const res = await this.fetch(`/domains/${domainId}/records/${recordId}`, { method: 'DELETE' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Linode API ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  // ── Instance Types & Regions ──────────────────────────────────────────

  /** List available instance types/plans. */
  async listTypes(): Promise<LinodeType[]> {
    const res = await this.fetch('/linode/types');
    const data: PaginatedResponse<any> = await this.json(res);
    return data.data.map((t: any) => ({
      id: t.id,
      label: t.label,
      price: { hourly: t.price?.hourly ?? 0, monthly: t.price?.monthly ?? 0 },
      memory: t.memory ?? 0,
      disk: t.disk ?? 0,
      vcpus: t.vcpus ?? 0,
      transfer: t.transfer ?? 0,
      class: t.class ?? 'standard',
    }));
  }

  /** List available regions. */
  async listRegions(): Promise<LinodeRegion[]> {
    const res = await this.fetch('/regions');
    const data: PaginatedResponse<any> = await this.json(res);
    return data.data.map((r: any) => ({
      id: r.id,
      label: r.label ?? r.id,
      country: r.country ?? '',
      capabilities: r.capabilities ?? [],
      status: r.status ?? 'ok',
    }));
  }

  // ── IP Addresses ──────────────────────────────────────────────────────

  /** Allocate an IP address to an instance. */
  async allocateIp(instanceId: number, opts?: {
    type?: 'ipv4';
    public?: boolean;
  }): Promise<{ address: string; type: string; public: boolean }> {
    const body: Record<string, unknown> = {
      type: opts?.type ?? 'ipv4',
      public: opts?.public ?? true,
    };
    const res = await this.fetch(`/linode/instances/${instanceId}/ips`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return {
      address: data.address,
      type: data.type ?? 'ipv4',
      public: data.public ?? true,
    };
  }

  // ── NodeBalancers ─────────────────────────────────────────────────────

  /** Create a NodeBalancer. */
  async createNodeBalancer(region: string, opts?: {
    label?: string;
    client_conn_throttle?: number;
    tags?: string[];
    configs?: Array<NodeBalancerConfigOptions & { nodes?: NodeBalancerNode[] }>;
  }): Promise<LinodeNodeBalancer> {
    const body: Record<string, unknown> = { region };
    if (opts?.label) body.label = opts.label;
    if (opts?.client_conn_throttle !== undefined) body.client_conn_throttle = opts.client_conn_throttle;
    if (opts?.tags) body.tags = opts.tags;
    if (opts?.configs) body.configs = opts.configs;

    const res = await this.fetch('/nodebalancers', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return this.mapNodeBalancer(data);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    return globalThis.fetch(url, {
      ...init,
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> ?? {}),
      },
    });
  }

  private async json(res: Response): Promise<any> {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Linode API ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
  }

  private mapInstance(data: any): LinodeInstance {
    return {
      id: data.id,
      label: data.label ?? '',
      status: data.status ?? 'offline',
      type: data.type ?? '',
      region: data.region ?? '',
      image: data.image ?? null,
      ipv4: data.ipv4 ?? [],
      ipv6: data.ipv6 ?? null,
      created: data.created ?? '',
      updated: data.updated ?? '',
      tags: data.tags ?? [],
      specs: {
        disk: data.specs?.disk ?? 0,
        memory: data.specs?.memory ?? 0,
        vcpus: data.specs?.vcpus ?? 0,
        transfer: data.specs?.transfer ?? 0,
      },
    };
  }

  private mapDomain(data: any): LinodeDomain {
    return {
      id: data.id,
      domain: data.domain ?? '',
      type: data.type ?? 'master',
      status: data.status ?? 'active',
      soa_email: data.soa_email ?? '',
      description: data.description ?? '',
      tags: data.tags ?? [],
      created: data.created ?? '',
      updated: data.updated ?? '',
    };
  }

  private mapDomainRecord(data: any): LinodeDomainRecord {
    return {
      id: data.id,
      type: data.type ?? 'A',
      name: data.name ?? '',
      target: data.target ?? '',
      priority: data.priority,
      weight: data.weight,
      port: data.port,
      ttl_sec: data.ttl_sec ?? 0,
      tag: data.tag,
    };
  }

  private mapNodeBalancer(data: any): LinodeNodeBalancer {
    return {
      id: data.id,
      label: data.label ?? '',
      region: data.region ?? '',
      hostname: data.hostname ?? '',
      ipv4: data.ipv4 ?? '',
      ipv6: data.ipv6 ?? null,
      client_conn_throttle: data.client_conn_throttle ?? 0,
      tags: data.tags ?? [],
      created: data.created ?? '',
      updated: data.updated ?? '',
      transfer: {
        in: data.transfer?.in ?? 0,
        out: data.transfer?.out ?? 0,
        total: data.transfer?.total ?? 0,
      },
    };
  }
}
