/**
 * @fileoverview Fly.io Machines API service layer.
 *
 * Wraps the Fly Machines API for app creation, machine management,
 * scaling, and volume provisioning. Uses the GraphQL API for listing
 * apps (organization-scoped) and the Machines REST API for everything else.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlyConfig {
  /** Fly.io API token (from `flyctl tokens create`) */
  token: string;
  /** Machines API base URL (defaults to https://api.machines.dev/v1) */
  baseUrl?: string;
  /** GraphQL API base URL for org-level queries (defaults to https://api.fly.io/graphql) */
  graphqlUrl?: string;
}

export interface FlyApp {
  id: string;
  name: string;
  organization: string;
  status: string;
  hostname: string;
  createdAt?: string;
  machines?: FlyMachine[];
}

export interface FlyMachine {
  id: string;
  name: string;
  state: string;
  region: string;
  instanceId: string;
  privateIp: string;
  config: FlyMachineConfig;
  imageRef?: { repository: string; tag: string; digest: string };
  createdAt: string;
  updatedAt: string;
}

export interface FlyMachineConfig {
  image: string;
  env?: Record<string, string>;
  services?: FlyMachineService[];
  guest?: { cpus: number; cpu_kind: string; memory_mb: number };
  size?: string;
  auto_destroy?: boolean;
  restart?: { policy: string; max_retries?: number };
  mounts?: Array<{ volume: string; path: string }>;
}

export interface FlyMachineService {
  ports: Array<{ port: number; handlers: string[]; force_https?: boolean }>;
  protocol: string;
  internal_port: number;
  autostop?: boolean;
  autostart?: boolean;
  min_machines_running?: number;
}

export interface FlyVolume {
  id: string;
  name: string;
  state: string;
  sizeGb: number;
  region: string;
  encrypted: boolean;
  createdAt: string;
  attachedMachineId?: string;
  attachedAllocId?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FlyService {
  private config: FlyConfig;
  private running = false;

  constructor(config: FlyConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.machines.dev/v1',
      graphqlUrl: config.graphqlUrl ?? 'https://api.fly.io/graphql',
    };
  }

  async initialize(): Promise<void> {
    // Validate token by listing apps (lightweight org query)
    const res = await this.gql<{ currentUser: { id: string } }>(`
      query { currentUser { id email } }
    `);
    if (!res.currentUser?.id) {
      throw new Error('Fly.io auth failed: could not retrieve user');
    }
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Apps ─────────────────────────────────────────────────────────────────

  /** Create a new Fly app. */
  async createApp(name: string, org?: string): Promise<FlyApp> {
    const body: Record<string, unknown> = {
      app_name: name,
      org_slug: org ?? 'personal',
    };

    const res = await this.fetch('/apps', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Machines API returns minimal data on create; fetch full app
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fly.io API ${res.status}: ${text.slice(0, 500)}`);
    }

    return this.getApp(name);
  }

  /** Get an app by name. */
  async getApp(appName: string): Promise<FlyApp> {
    const result = await this.gql<{ app: any }>(`
      query($name: String!) {
        app(name: $name) {
          id
          name
          organization { slug }
          status
          hostname
          createdAt
        }
      }
    `, { name: appName });

    const a = result.app;
    return {
      id: a.id,
      name: a.name,
      organization: a.organization?.slug ?? '',
      status: a.status ?? 'pending',
      hostname: a.hostname ?? `${a.name}.fly.dev`,
      createdAt: a.createdAt,
    };
  }

  /** List all apps in the personal org (via GraphQL). */
  async listApps(): Promise<FlyApp[]> {
    const result = await this.gql<{ apps: { nodes: any[] } }>(`
      query {
        apps {
          nodes {
            id
            name
            organization { slug }
            status
            hostname
            createdAt
          }
        }
      }
    `);

    return (result.apps?.nodes ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      organization: a.organization?.slug ?? '',
      status: a.status ?? 'pending',
      hostname: a.hostname ?? `${a.name}.fly.dev`,
      createdAt: a.createdAt,
    }));
  }

  // ── Machines ─────────────────────────────────────────────────────────────

  /** Create a machine in an app. */
  async createMachine(appName: string, config: FlyMachineConfig, opts?: {
    name?: string;
    region?: string;
  }): Promise<FlyMachine> {
    const body: Record<string, unknown> = { config };
    if (opts?.name) body.name = opts.name;
    if (opts?.region) body.region = opts.region;

    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/machines`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return this.mapMachine(data);
  }

  /** List all machines in an app. */
  async listMachines(appName: string): Promise<FlyMachine[]> {
    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/machines`);
    const data = await this.json(res);
    return (data as any[]).map((m: any) => this.mapMachine(m));
  }

  /** Stop and destroy a machine. */
  async destroyMachine(appName: string, machineId: string, force = false): Promise<void> {
    // Stop first
    try {
      await this.fetch(
        `/apps/${encodeURIComponent(appName)}/machines/${machineId}/stop`,
        { method: 'POST', body: JSON.stringify({}) },
      );
    } catch {
      // Machine may already be stopped
    }

    const url = `/apps/${encodeURIComponent(appName)}/machines/${machineId}${force ? '?force=true' : ''}`;
    const res = await this.fetch(url, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`Fly.io API ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  /** Update machine config (e.g. to change size/image). */
  async updateMachine(appName: string, machineId: string, config: Partial<FlyMachineConfig>): Promise<FlyMachine> {
    const res = await this.fetch(
      `/apps/${encodeURIComponent(appName)}/machines/${machineId}`,
      {
        method: 'POST',
        body: JSON.stringify({ config }),
      },
    );
    const data = await this.json(res);
    return this.mapMachine(data);
  }

  // ── Volumes ──────────────────────────────────────────────────────────────

  /** Create a persistent volume. */
  async createVolume(appName: string, opts: {
    name: string;
    region: string;
    sizeGb: number;
    encrypted?: boolean;
  }): Promise<FlyVolume> {
    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/volumes`, {
      method: 'POST',
      body: JSON.stringify({
        name: opts.name,
        region: opts.region,
        size_gb: opts.sizeGb,
        encrypted: opts.encrypted ?? true,
      }),
    });
    const data = await this.json(res);
    return this.mapVolume(data);
  }

  /** List volumes for an app. */
  async listVolumes(appName: string): Promise<FlyVolume[]> {
    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/volumes`);
    const data = await this.json(res);
    return (data as any[]).map((v: any) => this.mapVolume(v));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

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
      throw new Error(`Fly.io API ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
  }

  private async gql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await globalThis.fetch(this.config.graphqlUrl!, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fly.io GraphQL ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Fly.io GraphQL: ${json.errors.map(e => e.message).join('; ')}`);
    }

    return json.data as T;
  }

  private mapMachine(data: any): FlyMachine {
    return {
      id: data.id,
      name: data.name ?? '',
      state: data.state ?? 'unknown',
      region: data.region ?? '',
      instanceId: data.instance_id ?? '',
      privateIp: data.private_ip ?? '',
      config: {
        image: data.config?.image ?? '',
        env: data.config?.env,
        services: data.config?.services,
        guest: data.config?.guest,
        size: data.config?.size,
        auto_destroy: data.config?.auto_destroy,
        restart: data.config?.restart,
        mounts: data.config?.mounts,
      },
      imageRef: data.image_ref ? {
        repository: data.image_ref.repository ?? '',
        tag: data.image_ref.tag ?? '',
        digest: data.image_ref.digest ?? '',
      } : undefined,
      createdAt: data.created_at ?? '',
      updatedAt: data.updated_at ?? '',
    };
  }

  private mapVolume(data: any): FlyVolume {
    return {
      id: data.id,
      name: data.name ?? '',
      state: data.state ?? 'created',
      sizeGb: data.size_gb ?? 0,
      region: data.region ?? '',
      encrypted: data.encrypted ?? true,
      createdAt: data.created_at ?? '',
      attachedMachineId: data.attached_machine_id,
      attachedAllocId: data.attached_alloc_id,
    };
  }
}
