/**
 * @fileoverview Netlify REST API service layer.
 *
 * Wraps the Netlify API v1 for site deployment, domain management,
 * environment variable configuration, and deployment status tracking.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetlifyConfig {
  /** Netlify personal access token (from https://app.netlify.com/user/applications#personal-access-tokens) */
  token: string;
  /** API base URL (defaults to https://api.netlify.com/api/v1) */
  baseUrl?: string;
}

export interface NetlifySite {
  id: string;
  name: string;
  url: string;
  ssl_url: string;
  admin_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  repo?: { provider: string; repo_path: string; branch: string };
  custom_domain: string | null;
  default_domain: string;
  build_settings?: {
    cmd: string;
    dir: string;
    repo_url: string;
    repo_branch: string;
  };
}

export interface NetlifyDeploy {
  id: string;
  site_id: string;
  state: 'new' | 'uploading' | 'uploaded' | 'preparing' | 'prepared' | 'building' | 'ready' | 'error' | 'retrying';
  url: string;
  ssl_url: string;
  admin_url: string;
  deploy_url: string;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  branch: string | null;
  commit_ref: string | null;
  title: string | null;
}

export interface NetlifyDomain {
  hostname: string;
  ssl_url: string;
  configured: boolean;
}

export interface NetlifyEnvVar {
  key: string;
  scopes: ('builds' | 'functions' | 'runtime' | 'post_processing')[];
  values: Array<{
    value: string;
    context: 'all' | 'dev' | 'branch-deploy' | 'deploy-preview' | 'production';
  }>;
}

export interface DeployFromGitOptions {
  /** Git repository URL (e.g. "https://github.com/user/repo") */
  gitUrl: string;
  /** Site name on Netlify (auto-detected from repo if omitted) */
  siteName?: string;
  /** Build command (e.g. "npm run build") */
  buildCommand?: string;
  /** Publish directory (e.g. "dist", "build", "public") */
  publishDirectory?: string;
  /** Branch to deploy from (default: "main") */
  branch?: string;
  /** Environment variables to set */
  envVars?: Record<string, string>;
}

export interface DeployResult {
  id: string;
  siteId: string;
  siteName: string;
  url: string;
  sslUrl: string;
  adminUrl: string;
  state: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class NetlifyService {
  private config: NetlifyConfig;
  private running = false;

  constructor(config: NetlifyConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.netlify.com/api/v1',
    };
  }

  async initialize(): Promise<void> {
    // Validate token by fetching current user
    const res = await this.fetch('/user');
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Netlify auth failed: ${res.status} ${body}`);
    }
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // -- Sites ----------------------------------------------------------------

  /** List all sites. */
  async listSites(limit = 20): Promise<NetlifySite[]> {
    const res = await this.fetch(`/sites?per_page=${limit}`);
    const data = await this.json(res);
    return (data as any[]).map((s) => this.mapSite(s));
  }

  /** Get a site by ID or name. */
  async getSite(idOrName: string): Promise<NetlifySite> {
    const res = await this.fetch(`/sites/${encodeURIComponent(idOrName)}`);
    const data = await this.json(res);
    return this.mapSite(data);
  }

  /** Create a new site with optional Git repo configuration. */
  async createSite(name: string, opts?: {
    repoUrl?: string;
    branch?: string;
    buildCommand?: string;
    publishDirectory?: string;
  }): Promise<NetlifySite> {
    const body: Record<string, unknown> = { name };

    if (opts?.repoUrl) {
      const { provider, repoPath } = this.parseGitUrl(opts.repoUrl);
      body.repo = {
        provider,
        repo: repoPath,
        repo_branch: opts.branch ?? 'main',
        cmd: opts.buildCommand ?? '',
        dir: opts.publishDirectory ?? '',
      };
    }

    const res = await this.fetch('/sites', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return this.mapSite(data);
  }

  /** Update site settings. */
  async updateSite(siteId: string, settings: {
    name?: string;
    buildCommand?: string;
    publishDirectory?: string;
    branch?: string;
    customDomain?: string;
  }): Promise<NetlifySite> {
    const body: Record<string, unknown> = {};
    if (settings.name) body.name = settings.name;
    if (settings.customDomain) body.custom_domain = settings.customDomain;

    if (settings.buildCommand || settings.publishDirectory || settings.branch) {
      body.build_settings = {
        ...(settings.buildCommand ? { cmd: settings.buildCommand } : {}),
        ...(settings.publishDirectory ? { dir: settings.publishDirectory } : {}),
        ...(settings.branch ? { repo_branch: settings.branch } : {}),
      };
    }

    const res = await this.fetch(`/sites/${siteId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return this.mapSite(data);
  }

  // -- Deployments ----------------------------------------------------------

  /** Trigger a new deploy for a site. */
  async createDeploy(siteId: string, opts?: {
    title?: string;
    branch?: string;
    clearCache?: boolean;
  }): Promise<NetlifyDeploy> {
    const body: Record<string, unknown> = {};
    if (opts?.title) body.title = opts.title;
    if (opts?.branch) body.branch = opts.branch;
    if (opts?.clearCache) body.clear_cache = true;

    const res = await this.fetch(`/sites/${siteId}/deploys`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return this.mapDeploy(data);
  }

  /** Get deployment status. */
  async getDeploy(siteId: string, deployId: string): Promise<NetlifyDeploy> {
    const res = await this.fetch(`/sites/${siteId}/deploys/${deployId}`);
    const data = await this.json(res);
    return this.mapDeploy(data);
  }

  /** Deploy from a Git URL -- creates site if needed, then triggers deploy. */
  async deployFromGit(opts: DeployFromGitOptions): Promise<DeployResult> {
    const siteName = opts.siteName ?? this.inferSiteName(opts.gitUrl);

    // Try to get existing site
    let site: NetlifySite | null = null;
    try {
      site = await this.getSite(siteName);
    } catch {
      // Site doesn't exist -- create it
      site = await this.createSite(siteName, {
        repoUrl: opts.gitUrl,
        branch: opts.branch,
        buildCommand: opts.buildCommand,
        publishDirectory: opts.publishDirectory,
      });
    }

    // Set env vars if provided
    if (opts.envVars && Object.keys(opts.envVars).length > 0) {
      await this.setEnvVars(site.id, opts.envVars);
    }

    // Trigger deployment
    const deploy = await this.createDeploy(site.id, {
      title: `Deploy from ${opts.gitUrl}`,
      branch: opts.branch,
    });

    return {
      id: deploy.id,
      siteId: site.id,
      siteName: site.name,
      url: deploy.url || site.url,
      sslUrl: deploy.ssl_url || site.ssl_url,
      adminUrl: deploy.admin_url || site.admin_url,
      state: deploy.state,
    };
  }

  /** List recent deployments for a site. */
  async listDeploys(siteId: string, limit = 10): Promise<NetlifyDeploy[]> {
    const res = await this.fetch(`/sites/${siteId}/deploys?per_page=${limit}`);
    const data = await this.json(res);
    return (data as any[]).map((d) => this.mapDeploy(d));
  }

  // -- Domains --------------------------------------------------------------

  /** Set a custom domain on a site (via site update). */
  async setCustomDomain(siteId: string, domain: string): Promise<NetlifySite> {
    return this.updateSite(siteId, { customDomain: domain });
  }

  /** Get the DNS zone for a domain. */
  async getDnsZone(domain: string): Promise<{
    id: string;
    name: string;
    records: Array<{ hostname: string; type: string; value: string; ttl: number }>;
  } | null> {
    const res = await this.fetch('/dns_zones');
    const zones = await this.json(res) as any[];

    const zone = zones.find((z: any) => z.name === domain || z.name === domain.replace(/^www\./, ''));
    if (!zone) return null;

    const recordsRes = await this.fetch(`/dns_zones/${zone.id}/dns_records`);
    const records = await this.json(recordsRes) as any[];

    return {
      id: zone.id,
      name: zone.name,
      records: records.map((r: any) => ({
        hostname: r.hostname,
        type: r.type,
        value: r.value,
        ttl: r.ttl ?? 3600,
      })),
    };
  }

  /** List domain aliases for a site. */
  async listDomainAliases(siteId: string): Promise<NetlifyDomain[]> {
    const site = await this.getSite(siteId);
    const domains: NetlifyDomain[] = [];

    if (site.custom_domain) {
      domains.push({
        hostname: site.custom_domain,
        ssl_url: site.ssl_url,
        configured: true,
      });
    }

    domains.push({
      hostname: site.default_domain,
      ssl_url: site.ssl_url,
      configured: true,
    });

    return domains;
  }

  // -- Environment Variables ------------------------------------------------

  /** Set environment variables on a site. */
  async setEnvVars(
    siteId: string,
    vars: Record<string, string>,
    context: 'all' | 'dev' | 'branch-deploy' | 'deploy-preview' | 'production' = 'all',
  ): Promise<void> {
    // Netlify API uses account-level env vars endpoint
    // First get the account slug from the site
    const site = await this.getSite(siteId);
    const accountSlug = (site as any).account_slug ?? (site as any).account_name;

    if (!accountSlug) {
      // Fallback: use site-level build environment
      const buildEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(vars)) {
        buildEnv[key] = value;
      }
      await this.fetch(`/sites/${siteId}`, {
        method: 'PUT',
        body: JSON.stringify({ build_settings: { env: buildEnv } }),
      });
      return;
    }

    for (const [key, value] of Object.entries(vars)) {
      // Try to create; if already exists, update
      const res = await this.fetch(`/accounts/${accountSlug}/env/${encodeURIComponent(key)}?site_id=${siteId}`, {
        method: 'PUT',
        body: JSON.stringify({
          key,
          scopes: ['builds', 'functions', 'runtime', 'post_processing'],
          values: [{ value, context }],
        }),
      });

      if (!res.ok) {
        // Try creating instead
        await this.fetch(`/accounts/${accountSlug}/env?site_id=${siteId}`, {
          method: 'POST',
          body: JSON.stringify([{
            key,
            scopes: ['builds', 'functions', 'runtime', 'post_processing'],
            values: [{ value, context }],
          }]),
        });
      }
    }
  }

  /** List environment variables for a site. */
  async listEnvVars(siteId: string): Promise<NetlifyEnvVar[]> {
    // Try account-level endpoint first
    const site = await this.getSite(siteId);
    const accountSlug = (site as any).account_slug ?? (site as any).account_name;

    if (accountSlug) {
      const res = await this.fetch(`/accounts/${accountSlug}/env?site_id=${siteId}`);
      if (res.ok) {
        const data = await res.json() as any[];
        return data.map((e) => ({
          key: e.key,
          scopes: e.scopes ?? [],
          values: (e.values ?? []).map((v: any) => ({
            value: v.value ?? '(redacted)',
            context: v.context ?? 'all',
          })),
        }));
      }
    }

    // Fallback: get env from build settings
    const buildEnv = site.build_settings as any;
    if (buildEnv?.env) {
      return Object.entries(buildEnv.env).map(([key, value]) => ({
        key,
        scopes: ['builds' as const, 'functions' as const, 'runtime' as const, 'post_processing' as const],
        values: [{ value: value as string, context: 'all' as const }],
      }));
    }

    return [];
  }

  // -- Helpers --------------------------------------------------------------

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
      throw new Error(`Netlify API ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
  }

  private parseGitUrl(url: string): { provider: string; repoPath: string } {
    const match = url.match(/(?:github\.com|gitlab\.com|bitbucket\.org)[/:]([^/]+\/[^/.]+)/);
    if (!match) throw new Error(`Cannot parse git URL: ${url}`);

    const provider = url.includes('github.com') ? 'github'
      : url.includes('gitlab.com') ? 'gitlab'
      : 'bitbucket';

    return { provider, repoPath: match[1] };
  }

  private inferSiteName(gitUrl: string): string {
    const { repoPath } = this.parseGitUrl(gitUrl);
    const repo = repoPath.split('/')[1] ?? repoPath;
    return repo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  private mapSite(data: any): NetlifySite {
    return {
      id: data.id,
      name: data.name ?? data.subdomain ?? '',
      url: data.url ?? '',
      ssl_url: data.ssl_url ?? '',
      admin_url: data.admin_url ?? '',
      state: data.state ?? 'unknown',
      created_at: data.created_at ?? '',
      updated_at: data.updated_at ?? '',
      repo: data.build_settings?.repo_url ? {
        provider: data.build_settings.provider ?? 'github',
        repo_path: data.build_settings.repo_path ?? data.build_settings.repo_url ?? '',
        branch: data.build_settings.repo_branch ?? 'main',
      } : undefined,
      custom_domain: data.custom_domain ?? null,
      default_domain: data.default_domain ?? `${data.name ?? data.subdomain}.netlify.app`,
      build_settings: data.build_settings ? {
        cmd: data.build_settings.cmd ?? '',
        dir: data.build_settings.dir ?? '',
        repo_url: data.build_settings.repo_url ?? '',
        repo_branch: data.build_settings.repo_branch ?? 'main',
      } : undefined,
    };
  }

  private mapDeploy(data: any): NetlifyDeploy {
    return {
      id: data.id,
      site_id: data.site_id ?? '',
      state: data.state ?? 'new',
      url: data.url ?? '',
      ssl_url: data.ssl_url ?? '',
      admin_url: data.admin_url ?? '',
      deploy_url: data.deploy_url ?? data.deploy_ssl_url ?? '',
      created_at: data.created_at ?? '',
      updated_at: data.updated_at ?? '',
      error_message: data.error_message ?? null,
      branch: data.branch ?? null,
      commit_ref: data.commit_ref ?? null,
      title: data.title ?? null,
    };
  }
}
