// @ts-nocheck
/**
 * @fileoverview Heroku Platform API service layer.
 *
 * Wraps the Heroku Platform API for app management, source deployments,
 * addon provisioning, dyno scaling, config vars, and log streaming.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HerokuConfig {
  /** Heroku API key (from https://dashboard.heroku.com/account) */
  apiKey: string;
  /** API base URL (defaults to https://api.heroku.com) */
  baseUrl?: string;
}

export interface HerokuApp {
  id: string;
  name: string;
  region: string;
  stack: string;
  webUrl: string;
  gitUrl: string;
  createdAt: string;
  updatedAt: string;
  maintenance: boolean;
}

export interface HerokuBuild {
  id: string;
  appId: string;
  status: 'pending' | 'successful' | 'failed';
  outputStreamUrl: string;
  createdAt: string;
  updatedAt: string;
  sourceBlob: { url: string; version?: string };
}

export interface HerokuAddon {
  id: string;
  name: string;
  plan: { id: string; name: string; price: { cents: number; unit: string } };
  state: string;
  appId: string;
  webUrl?: string;
  configVars: string[];
}

export interface HerokuLogSession {
  id: string;
  logplexUrl: string;
  createdAt: string;
}

export interface HerokuFormation {
  id: string;
  type: string;
  quantity: number;
  size: string;
  command: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HerokuService {
  private config: HerokuConfig;
  private running = false;

  constructor(config: HerokuConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.heroku.com',
    };
  }

  async initialize(): Promise<void> {
    // Validate API key by fetching account info
    const res = await this.fetch('/account');
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Heroku auth failed: ${res.status} ${body}`);
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

  /** Create a new Heroku app. */
  async createApp(opts?: {
    name?: string;
    region?: string;
    stack?: string;
  }): Promise<HerokuApp> {
    const body: Record<string, unknown> = {};
    if (opts?.name) body.name = opts.name;
    if (opts?.region) body.region = opts.region;
    if (opts?.stack) body.stack = opts.stack;

    const res = await this.fetch('/apps', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return this.mapApp(data);
  }

  /** List all apps. */
  async listApps(): Promise<HerokuApp[]> {
    const res = await this.fetch('/apps');
    const data = await this.json(res);
    return (data as any[]).map((a: any) => this.mapApp(a));
  }

  /** Get a single app by name or ID. */
  async getApp(nameOrId: string): Promise<HerokuApp> {
    const res = await this.fetch(`/apps/${encodeURIComponent(nameOrId)}`);
    const data = await this.json(res);
    return this.mapApp(data);
  }

  /** Delete an app. */
  async deleteApp(nameOrId: string): Promise<void> {
    const res = await this.fetch(`/apps/${encodeURIComponent(nameOrId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Heroku API ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  // ── Builds ───────────────────────────────────────────────────────────────

  /** Create a build from a source tarball URL. */
  async createBuild(appName: string, sourceUrl: string, version?: string): Promise<HerokuBuild> {
    const sourceBlob: Record<string, string> = { url: sourceUrl };
    if (version) sourceBlob.version = version;

    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/builds`, {
      method: 'POST',
      body: JSON.stringify({ source_blob: sourceBlob }),
    });
    const data = await this.json(res);
    return this.mapBuild(data);
  }

  /** Get build status. */
  async getBuild(appName: string, buildId: string): Promise<HerokuBuild> {
    const res = await this.fetch(
      `/apps/${encodeURIComponent(appName)}/builds/${encodeURIComponent(buildId)}`,
    );
    const data = await this.json(res);
    return this.mapBuild(data);
  }

  // ── Config Vars ──────────────────────────────────────────────────────────

  /** Get all config vars for an app. */
  async getConfigVars(appName: string): Promise<Record<string, string>> {
    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/config-vars`);
    return this.json(res);
  }

  /** Update config vars (merge). */
  async updateConfigVars(appName: string, vars: Record<string, string | null>): Promise<Record<string, string>> {
    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/config-vars`, {
      method: 'PATCH',
      body: JSON.stringify(vars),
    });
    return this.json(res);
  }

  // ── Addons ───────────────────────────────────────────────────────────────

  /** Provision an addon on an app. */
  async addAddon(appName: string, plan: string, opts?: {
    name?: string;
    config?: Record<string, string>;
  }): Promise<HerokuAddon> {
    const body: Record<string, unknown> = { plan };
    if (opts?.name) body.name = opts.name;
    if (opts?.config) body.config = opts.config;

    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/addons`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return this.mapAddon(data);
  }

  /** List addons for an app. */
  async listAddons(appName: string): Promise<HerokuAddon[]> {
    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/addons`);
    const data = await this.json(res);
    return (data as any[]).map((a: any) => this.mapAddon(a));
  }

  // ── Logs ─────────────────────────────────────────────────────────────────

  /** Create a log session to get a log stream URL. */
  async createLogSession(appName: string, opts?: {
    dyno?: string;
    lines?: number;
    source?: string;
    tail?: boolean;
  }): Promise<HerokuLogSession> {
    const body: Record<string, unknown> = {};
    if (opts?.dyno) body.dyno = opts.dyno;
    if (opts?.lines) body.lines = opts.lines;
    if (opts?.source) body.source = opts.source;
    if (opts?.tail !== undefined) body.tail = opts.tail;

    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/log-sessions`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return {
      id: data.id,
      logplexUrl: data.logplex_url,
      createdAt: data.created_at,
    };
  }

  /** Fetch recent log lines from a log session URL. */
  async fetchLogs(logplexUrl: string): Promise<string> {
    const res = await globalThis.fetch(logplexUrl);
    if (!res.ok) {
      throw new Error(`Log fetch failed: ${res.status}`);
    }
    return res.text();
  }

  // ── Formation (Dynos) ────────────────────────────────────────────────────

  /** Scale a dyno type. */
  async scaleDynos(appName: string, type: string, quantity: number, size?: string): Promise<HerokuFormation> {
    const body: Record<string, unknown> = { quantity };
    if (size) body.size = size;

    const res = await this.fetch(
      `/apps/${encodeURIComponent(appName)}/formation/${encodeURIComponent(type)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    );
    const data = await this.json(res);
    return this.mapFormation(data);
  }

  /** List all dyno formations for an app. */
  async listFormation(appName: string): Promise<HerokuFormation[]> {
    const res = await this.fetch(`/apps/${encodeURIComponent(appName)}/formation`);
    const data = await this.json(res);
    return (data as any[]).map((f: any) => this.mapFormation(f));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    return globalThis.fetch(url, {
      ...init,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Accept': 'application/vnd.heroku+json; version=3',
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> ?? {}),
      },
    });
  }

  private async json(res: Response): Promise<any> {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Heroku API ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
  }

  private mapApp(data: any): HerokuApp {
    return {
      id: data.id,
      name: data.name,
      region: data.region?.name ?? data.region ?? '',
      stack: data.stack?.name ?? data.stack ?? '',
      webUrl: data.web_url ?? '',
      gitUrl: data.git_url ?? '',
      createdAt: data.created_at ?? '',
      updatedAt: data.updated_at ?? '',
      maintenance: data.maintenance ?? false,
    };
  }

  private mapBuild(data: any): HerokuBuild {
    return {
      id: data.id,
      appId: data.app?.id ?? '',
      status: data.status ?? 'pending',
      outputStreamUrl: data.output_stream_url ?? '',
      createdAt: data.created_at ?? '',
      updatedAt: data.updated_at ?? '',
      sourceBlob: {
        url: data.source_blob?.url ?? '',
        version: data.source_blob?.version,
      },
    };
  }

  private mapAddon(data: any): HerokuAddon {
    return {
      id: data.id,
      name: data.name ?? '',
      plan: {
        id: data.plan?.id ?? '',
        name: data.plan?.name ?? '',
        price: data.plan?.price ?? { cents: 0, unit: 'month' },
      },
      state: data.state ?? 'provisioning',
      appId: data.app?.id ?? '',
      webUrl: data.web_url,
      configVars: data.config_vars ?? [],
    };
  }

  private mapFormation(data: any): HerokuFormation {
    return {
      id: data.id,
      type: data.type ?? '',
      quantity: data.quantity ?? 0,
      size: data.size ?? 'basic',
      command: data.command ?? '',
    };
  }
}
