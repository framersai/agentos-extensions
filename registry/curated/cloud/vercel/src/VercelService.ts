/**
 * @fileoverview Vercel REST API service layer.
 *
 * Wraps the Vercel API v13 for project deployment, domain management,
 * environment variable configuration, and deployment status tracking.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VercelConfig {
  /** Vercel API token (from https://vercel.com/account/tokens) */
  token: string;
  /** Team ID / scope (optional — omit for personal account) */
  teamId?: string;
  /** API base URL (defaults to https://api.vercel.com) */
  baseUrl?: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  createdAt: number;
  updatedAt: number;
  latestDeployments?: VercelDeployment[];
  link?: { type: string; repo: string; org: string };
}

export interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  created: number;
  readyState?: string;
  inspectorUrl?: string;
  meta?: Record<string, string>;
}

export interface VercelDomain {
  name: string;
  verified: boolean;
  configured: boolean;
  gitBranch?: string;
  redirect?: string;
  redirectStatusCode?: number;
}

export interface VercelEnvVar {
  key: string;
  value: string;
  target: ('production' | 'preview' | 'development')[];
  type?: 'plain' | 'encrypted' | 'secret' | 'system';
}

export interface DeployFromGitOptions {
  /** Git repository URL (e.g. "https://github.com/user/repo") */
  gitUrl: string;
  /** Project name (auto-detected from repo if omitted) */
  projectName?: string;
  /** Framework preset (auto-detected if omitted) */
  framework?: string;
  /** Build command override */
  buildCommand?: string;
  /** Output directory override */
  outputDirectory?: string;
  /** Environment variables to set */
  envVars?: Record<string, string>;
}

export interface DeployResult {
  id: string;
  url: string;
  readyState: string;
  inspectorUrl: string;
  projectId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class VercelService {
  private config: VercelConfig;
  private running = false;

  constructor(config: VercelConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.vercel.com',
    };
  }

  async initialize(): Promise<void> {
    // Validate token by fetching user info
    const res = await this.fetch('/v2/user');
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Vercel auth failed: ${res.status} ${body}`);
    }
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Projects ────────────────────────────────────────────────────────────

  /** List all projects. */
  async listProjects(limit = 20): Promise<VercelProject[]> {
    const res = await this.fetch(`/v9/projects?limit=${limit}`);
    const data = await this.json(res);
    return (data.projects ?? []).map((p: any) => this.mapProject(p));
  }

  /** Get a project by ID or name. */
  async getProject(idOrName: string): Promise<VercelProject> {
    const res = await this.fetch(`/v9/projects/${encodeURIComponent(idOrName)}`);
    const data = await this.json(res);
    return this.mapProject(data);
  }

  /** Create a new project linked to a Git repository. */
  async createProject(name: string, gitUrl: string, opts?: {
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
  }): Promise<VercelProject> {
    const { owner, repo, provider } = this.parseGitUrl(gitUrl);

    const body: Record<string, unknown> = {
      name,
      gitRepository: {
        type: provider,
        repo: `${owner}/${repo}`,
      },
    };

    if (opts?.framework) body.framework = opts.framework;
    if (opts?.buildCommand) body.buildCommand = opts.buildCommand;
    if (opts?.outputDirectory) body.outputDirectory = opts.outputDirectory;

    const res = await this.fetch('/v10/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return this.mapProject(data);
  }

  // ── Deployments ─────────────────────────────────────────────────────────

  /** Trigger a deployment from an existing project (triggers rebuild from latest commit). */
  async createDeployment(projectName: string, opts?: {
    target?: 'production' | 'preview';
    gitRef?: string;
  }): Promise<DeployResult> {
    const body: Record<string, unknown> = {
      name: projectName,
      target: opts?.target ?? 'production',
    };

    if (opts?.gitRef) {
      body.gitSource = { ref: opts.gitRef };
    }

    const res = await this.fetch('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return {
      id: data.id,
      url: `https://${data.url}`,
      readyState: data.readyState ?? data.status ?? 'BUILDING',
      inspectorUrl: data.inspectorUrl ?? '',
      projectId: data.projectId ?? '',
    };
  }

  /** Deploy from a Git URL — creates project if needed, then deploys. */
  async deployFromGit(opts: DeployFromGitOptions): Promise<DeployResult> {
    const projectName = opts.projectName ?? this.inferProjectName(opts.gitUrl);

    // Try to get existing project
    let project: VercelProject | null = null;
    try {
      project = await this.getProject(projectName);
    } catch {
      // Project doesn't exist — create it
      project = await this.createProject(projectName, opts.gitUrl, {
        framework: opts.framework,
        buildCommand: opts.buildCommand,
        outputDirectory: opts.outputDirectory,
      });
    }

    // Set env vars if provided
    if (opts.envVars && Object.keys(opts.envVars).length > 0) {
      await this.setEnvVars(project.id, opts.envVars);
    }

    // Trigger deployment
    return this.createDeployment(projectName);
  }

  /** Get deployment status. */
  async getDeployment(deploymentId: string): Promise<VercelDeployment> {
    const res = await this.fetch(`/v13/deployments/${deploymentId}`);
    const data = await this.json(res);
    return this.mapDeployment(data);
  }

  /** List recent deployments for a project. */
  async listDeployments(projectId: string, limit = 10): Promise<VercelDeployment[]> {
    const res = await this.fetch(`/v6/deployments?projectId=${projectId}&limit=${limit}`);
    const data = await this.json(res);
    return (data.deployments ?? []).map((d: any) => this.mapDeployment(d));
  }

  // ── Domains ─────────────────────────────────────────────────────────────

  /** Add a custom domain to a project. */
  async addDomain(projectId: string, domain: string, opts?: {
    gitBranch?: string;
    redirect?: string;
    redirectStatusCode?: number;
  }): Promise<VercelDomain> {
    const body: Record<string, unknown> = { name: domain };
    if (opts?.gitBranch) body.gitBranch = opts.gitBranch;
    if (opts?.redirect) body.redirect = opts.redirect;
    if (opts?.redirectStatusCode) body.redirectStatusCode = opts.redirectStatusCode;

    const res = await this.fetch(`/v10/projects/${projectId}/domains`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await this.json(res);
    return {
      name: data.name,
      verified: data.verified ?? false,
      configured: data.configured ?? false,
      gitBranch: data.gitBranch,
      redirect: data.redirect,
      redirectStatusCode: data.redirectStatusCode,
    };
  }

  /** Remove a custom domain from a project. */
  async removeDomain(projectId: string, domain: string): Promise<void> {
    await this.fetch(`/v9/projects/${projectId}/domains/${domain}`, {
      method: 'DELETE',
    });
  }

  /** List domains for a project. */
  async listDomains(projectId: string): Promise<VercelDomain[]> {
    const res = await this.fetch(`/v9/projects/${projectId}/domains`);
    const data = await this.json(res);
    return (data.domains ?? []).map((d: any) => ({
      name: d.name,
      verified: d.verified ?? false,
      configured: d.configured ?? false,
      gitBranch: d.gitBranch,
      redirect: d.redirect,
      redirectStatusCode: d.redirectStatusCode,
    }));
  }

  /** Get domain configuration info (for DNS setup). */
  async getDomainConfig(domain: string): Promise<{
    configuredBy: string | null;
    nameservers: string[];
    misconfigured: boolean;
    cnames: string[];
    aValues: string[];
  }> {
    const res = await this.fetch(`/v6/domains/${domain}/config`);
    const data = await this.json(res);
    return {
      configuredBy: data.configuredBy ?? null,
      nameservers: data.nameservers ?? [],
      misconfigured: data.misconfigured ?? true,
      cnames: data.cnames ?? [],
      aValues: data.aValues ?? [],
    };
  }

  // ── Environment Variables ───────────────────────────────────────────────

  /** Set environment variables on a project. */
  async setEnvVars(
    projectId: string,
    vars: Record<string, string>,
    target: ('production' | 'preview' | 'development')[] = ['production', 'preview', 'development'],
  ): Promise<void> {
    for (const [key, value] of Object.entries(vars)) {
      // Try to create; if already exists, update
      const res = await this.fetch(`/v10/projects/${projectId}/env`, {
        method: 'POST',
        body: JSON.stringify({ key, value, target, type: 'encrypted' }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, any>;
        // If already exists, try patching
        if (body.error?.code === 'ENV_ALREADY_EXISTS') {
          const envId = body.error?.envId ?? body.error?.envVarId;
          if (envId) {
            await this.fetch(`/v9/projects/${projectId}/env/${envId}`, {
              method: 'PATCH',
              body: JSON.stringify({ value, target, type: 'encrypted' }),
            });
          }
        }
      }
    }
  }

  /** List environment variables for a project. */
  async listEnvVars(projectId: string): Promise<VercelEnvVar[]> {
    const res = await this.fetch(`/v9/projects/${projectId}/env`);
    const data = await this.json(res);
    return (data.envs ?? []).map((e: any) => ({
      key: e.key,
      value: e.value ?? '(encrypted)',
      target: e.target ?? [],
      type: e.type ?? 'plain',
    }));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl}${path}${this.teamQuery(path)}`;
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
      throw new Error(`Vercel API ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
  }

  private teamQuery(path: string): string {
    if (!this.config.teamId) return '';
    return path.includes('?') ? `&teamId=${this.config.teamId}` : `?teamId=${this.config.teamId}`;
  }

  private parseGitUrl(url: string): { owner: string; repo: string; provider: string } {
    // Handle github.com, gitlab.com, bitbucket.org
    const match = url.match(/(?:github\.com|gitlab\.com|bitbucket\.org)[/:]([^/]+)\/([^/.]+)/);
    if (!match) throw new Error(`Cannot parse git URL: ${url}`);

    const provider = url.includes('github.com') ? 'github'
      : url.includes('gitlab.com') ? 'gitlab'
      : 'bitbucket';

    return { owner: match[1], repo: match[2], provider };
  }

  private inferProjectName(gitUrl: string): string {
    const { repo } = this.parseGitUrl(gitUrl);
    return repo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  private mapProject(data: any): VercelProject {
    return {
      id: data.id,
      name: data.name,
      framework: data.framework ?? null,
      createdAt: data.createdAt ?? 0,
      updatedAt: data.updatedAt ?? 0,
      latestDeployments: data.latestDeployments?.map((d: any) => this.mapDeployment(d)),
      link: data.link ? { type: data.link.type, repo: data.link.repo, org: data.link.org } : undefined,
    };
  }

  private mapDeployment(data: any): VercelDeployment {
    return {
      uid: data.uid ?? data.id,
      name: data.name ?? '',
      url: data.url ? (data.url.startsWith('http') ? data.url : `https://${data.url}`) : '',
      state: data.state ?? data.readyState ?? 'BUILDING',
      created: data.created ?? data.createdAt ?? 0,
      readyState: data.readyState,
      inspectorUrl: data.inspectorUrl,
      meta: data.meta,
    };
  }
}
