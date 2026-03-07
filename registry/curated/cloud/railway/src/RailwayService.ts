/**
 * @fileoverview Railway GraphQL API service layer.
 *
 * Wraps the Railway GraphQL API v2 for project management, service deployment,
 * database plugin provisioning, and deployment log retrieval.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RailwayConfig {
  /** Railway API token (from https://railway.com/account/tokens) */
  token: string;
  /** GraphQL API base URL (defaults to https://backboard.railway.com/graphql/v2) */
  baseUrl?: string;
}

export interface RailwayProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  environments: RailwayEnvironment[];
  services: RailwayService_[];
}

export interface RailwayEnvironment {
  id: string;
  name: string;
  isEphemeral: boolean;
}

/** Underscore suffix to avoid clash with the service class name. */
export interface RailwayService_ {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  icon?: string;
}

export interface RailwayDeployment {
  id: string;
  serviceId: string;
  environmentId: string;
  status: string;
  createdAt: string;
  url?: string;
  staticUrl?: string;
}

export interface RailwayPlugin {
  id: string;
  name: string;
  status: string;
  friendlyName: string;
}

export interface RailwayLogEntry {
  timestamp: string;
  message: string;
  severity: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RailwayService {
  private config: RailwayConfig;
  private running = false;

  constructor(config: RailwayConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? 'https://backboard.railway.com/graphql/v2',
    };
  }

  async initialize(): Promise<void> {
    // Validate token by fetching current user
    const result = await this.gql<{ me: { id: string } }>(`query { me { id name email } }`);
    if (!result.me?.id) {
      throw new Error('Railway auth failed: could not retrieve user');
    }
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  /** List all projects. */
  async listProjects(): Promise<RailwayProject[]> {
    const result = await this.gql<{ projects: { edges: Array<{ node: any }> } }>(`
      query {
        projects {
          edges {
            node {
              id
              name
              description
              createdAt
              updatedAt
              environments {
                edges { node { id name isEphemeral } }
              }
              services {
                edges { node { id name projectId createdAt updatedAt icon } }
              }
            }
          }
        }
      }
    `);

    return (result.projects?.edges ?? []).map((e: any) => this.mapProject(e.node));
  }

  /** Get a single project by ID. */
  async getProject(projectId: string): Promise<RailwayProject> {
    const result = await this.gql<{ project: any }>(`
      query($id: String!) {
        project(id: $id) {
          id
          name
          description
          createdAt
          updatedAt
          environments {
            edges { node { id name isEphemeral } }
          }
          services {
            edges { node { id name projectId createdAt updatedAt icon } }
          }
        }
      }
    `, { id: projectId });

    return this.mapProject(result.project);
  }

  /** Create a new project. */
  async createProject(name: string, description?: string): Promise<RailwayProject> {
    const result = await this.gql<{ projectCreate: any }>(`
      mutation($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          id
          name
          description
          createdAt
          updatedAt
          environments {
            edges { node { id name isEphemeral } }
          }
          services {
            edges { node { id name projectId createdAt updatedAt icon } }
          }
        }
      }
    `, { input: { name, description: description ?? '' } });

    return this.mapProject(result.projectCreate);
  }

  // ── Services ─────────────────────────────────────────────────────────────

  /** Create a service in a project from a GitHub repo. */
  async createService(projectId: string, opts: {
    name?: string;
    source?: { repo: string };
    variables?: Record<string, string>;
  }): Promise<RailwayService_> {
    const result = await this.gql<{ serviceCreate: any }>(`
      mutation($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          name
          projectId
          createdAt
          updatedAt
        }
      }
    `, {
      input: {
        projectId,
        name: opts.name,
        source: opts.source ? { repo: opts.source.repo } : undefined,
      },
    });

    const service = result.serviceCreate;

    // Set env variables if provided
    if (opts.variables && Object.keys(opts.variables).length > 0) {
      // Get the production environment
      const project = await this.getProject(projectId);
      const prodEnv = project.environments.find(e => !e.isEphemeral) ?? project.environments[0];
      if (prodEnv) {
        await this.upsertVariables(service.id, prodEnv.id, opts.variables);
      }
    }

    return {
      id: service.id,
      name: service.name ?? '',
      projectId: service.projectId ?? projectId,
      createdAt: service.createdAt ?? '',
      updatedAt: service.updatedAt ?? '',
    };
  }

  /** Trigger a redeployment for a service in a given environment. */
  async redeployService(serviceId: string, environmentId: string): Promise<RailwayDeployment> {
    const result = await this.gql<{ serviceInstanceRedeploy: boolean }>(`
      mutation($serviceId: String!, $environmentId: String!) {
        serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
      }
    `, { serviceId, environmentId });

    // The redeploy mutation returns a boolean; fetch latest deployment
    return this.getLatestDeployment(serviceId, environmentId);
  }

  /** Set environment variables for a service instance. */
  async upsertVariables(serviceId: string, environmentId: string, variables: Record<string, string>): Promise<boolean> {
    const result = await this.gql<{ variableCollectionUpsert: boolean }>(`
      mutation($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }
    `, {
      input: {
        serviceId,
        environmentId,
        variables,
      },
    });

    return result.variableCollectionUpsert ?? false;
  }

  // ── Plugins (Databases) ──────────────────────────────────────────────────

  /** Create a database plugin in a project. */
  async createPlugin(projectId: string, plugin: 'postgresql' | 'redis' | 'mysql' | 'mongodb'): Promise<RailwayPlugin> {
    const result = await this.gql<{ pluginCreate: any }>(`
      mutation($input: PluginCreateInput!) {
        pluginCreate(input: $input) {
          id
          name
          status
          friendlyName
        }
      }
    `, {
      input: {
        projectId,
        name: plugin,
      },
    });

    const p = result.pluginCreate;
    return {
      id: p.id,
      name: p.name ?? plugin,
      status: p.status ?? 'provisioning',
      friendlyName: p.friendlyName ?? plugin,
    };
  }

  // ── Deployments ──────────────────────────────────────────────────────────

  /** Get the latest deployment for a service in an environment. */
  async getLatestDeployment(serviceId: string, environmentId: string): Promise<RailwayDeployment> {
    const result = await this.gql<{ deployments: { edges: Array<{ node: any }> } }>(`
      query($input: DeploymentListInput!) {
        deployments(input: $input, first: 1) {
          edges {
            node {
              id
              serviceId
              environmentId
              status
              createdAt
              staticUrl
            }
          }
        }
      }
    `, {
      input: { serviceId, environmentId },
    });

    const edge = result.deployments?.edges?.[0];
    if (!edge) {
      return {
        id: '',
        serviceId,
        environmentId,
        status: 'unknown',
        createdAt: '',
      };
    }

    const d = edge.node;
    return {
      id: d.id,
      serviceId: d.serviceId ?? serviceId,
      environmentId: d.environmentId ?? environmentId,
      status: d.status ?? 'unknown',
      createdAt: d.createdAt ?? '',
      url: d.url,
      staticUrl: d.staticUrl,
    };
  }

  // ── Logs ─────────────────────────────────────────────────────────────────

  /** Get deployment logs. */
  async getDeploymentLogs(deploymentId: string): Promise<RailwayLogEntry[]> {
    const result = await this.gql<{ deploymentLogs: any[] }>(`
      query($deploymentId: String!) {
        deploymentLogs(deploymentId: $deploymentId) {
          timestamp
          message
          severity
        }
      }
    `, { deploymentId });

    return (result.deploymentLogs ?? []).map((l: any) => ({
      timestamp: l.timestamp ?? '',
      message: l.message ?? '',
      severity: l.severity ?? 'info',
    }));
  }

  /** Get build logs for a deployment. */
  async getBuildLogs(deploymentId: string): Promise<RailwayLogEntry[]> {
    const result = await this.gql<{ buildLogs: any[] }>(`
      query($deploymentId: String!) {
        buildLogs(deploymentId: $deploymentId) {
          timestamp
          message
          severity
        }
      }
    `, { deploymentId });

    return (result.buildLogs ?? []).map((l: any) => ({
      timestamp: l.timestamp ?? '',
      message: l.message ?? '',
      severity: l.severity ?? 'info',
    }));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async gql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await globalThis.fetch(this.config.baseUrl!, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Railway API ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Railway GraphQL: ${json.errors.map(e => e.message).join('; ')}`);
    }

    return json.data as T;
  }

  private mapProject(data: any): RailwayProject {
    return {
      id: data.id,
      name: data.name ?? '',
      description: data.description ?? '',
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? '',
      environments: (data.environments?.edges ?? []).map((e: any) => ({
        id: e.node.id,
        name: e.node.name ?? '',
        isEphemeral: e.node.isEphemeral ?? false,
      })),
      services: (data.services?.edges ?? []).map((e: any) => ({
        id: e.node.id,
        name: e.node.name ?? '',
        projectId: e.node.projectId ?? data.id,
        createdAt: e.node.createdAt ?? '',
        updatedAt: e.node.updatedAt ?? '',
        icon: e.node.icon,
      })),
    };
  }
}
