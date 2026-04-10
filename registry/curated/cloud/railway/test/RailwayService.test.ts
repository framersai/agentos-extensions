// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RailwayService } from '../src/RailwayService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(data: unknown, status = 200): Response {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    text: vi.fn().mockResolvedValue(body),
    json: vi.fn().mockResolvedValue(typeof data === 'string' ? {} : data),
    clone: vi.fn(),
  } as unknown as Response;
}

function gqlResponse(data: unknown): Response {
  return mockResponse({ data });
}

function gqlErrorResponse(messages: string[]): Response {
  return mockResponse({
    errors: messages.map((m) => ({ message: m })),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RailwayService', () => {
  let service: RailwayService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    service = new RailwayService({
      token: 'railway-test-token-abc',
      baseUrl: 'https://backboard.railway.com/graphql/v2',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initialize / Shutdown ───────────────────────────────────────────────

  describe('initialize', () => {
    it('should succeed when me query returns a user id', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ me: { id: 'user-1', name: 'Test', email: 'test@test.com' } }));
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should throw when me query returns no id', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ me: { id: null } }));
      await expect(service.initialize()).rejects.toThrow('Railway auth failed: could not retrieve user');
      expect(service.isRunning).toBe(false);
    });

    it('should throw when API returns non-OK status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Unauthorized', 401));
      await expect(service.initialize()).rejects.toThrow('Railway API 401');
    });

    it('should throw on GraphQL errors', async () => {
      mockFetch.mockResolvedValueOnce(gqlErrorResponse(['Invalid token']));
      await expect(service.initialize()).rejects.toThrow('Railway GraphQL: Invalid token');
    });
  });

  describe('shutdown', () => {
    it('should set isRunning to false', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ me: { id: 'u1' } }));
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  // ── Projects ────────────────────────────────────────────────────────────

  describe('listProjects', () => {
    it('should return mapped projects with environments and services', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        projects: {
          edges: [
            {
              node: {
                id: 'proj-1',
                name: 'my-project',
                description: 'A test project',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-02',
                environments: {
                  edges: [
                    { node: { id: 'env-prod', name: 'production', isEphemeral: false } },
                    { node: { id: 'env-pr', name: 'pr-123', isEphemeral: true } },
                  ],
                },
                services: {
                  edges: [
                    { node: { id: 'svc-1', name: 'web', projectId: 'proj-1', createdAt: '', updatedAt: '' } },
                  ],
                },
              },
            },
          ],
        },
      }));
      const projects = await service.listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('my-project');
      expect(projects[0].environments).toHaveLength(2);
      expect(projects[0].environments[0].name).toBe('production');
      expect(projects[0].environments[1].isEphemeral).toBe(true);
      expect(projects[0].services).toHaveLength(1);
      expect(projects[0].services[0].name).toBe('web');
    });

    it('should return empty array when no projects exist', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ projects: { edges: [] } }));
      const projects = await service.listProjects();
      expect(projects).toHaveLength(0);
    });
  });

  describe('getProject', () => {
    it('should return a single project by ID', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        project: {
          id: 'proj-1',
          name: 'my-project',
          description: 'desc',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
          environments: { edges: [] },
          services: { edges: [] },
        },
      }));
      const project = await service.getProject('proj-1');
      expect(project.id).toBe('proj-1');
      expect(project.name).toBe('my-project');
      expect(project.environments).toHaveLength(0);
    });

    it('should throw on GraphQL errors', async () => {
      mockFetch.mockResolvedValueOnce(gqlErrorResponse(['Project not found']));
      await expect(service.getProject('bad-id')).rejects.toThrow('Railway GraphQL: Project not found');
    });
  });

  describe('createProject', () => {
    it('should create a project and return it', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        projectCreate: {
          id: 'proj-new',
          name: 'new-project',
          description: 'Fresh project',
          createdAt: '2024-06-01',
          updatedAt: '2024-06-01',
          environments: {
            edges: [{ node: { id: 'env-prod', name: 'production', isEphemeral: false } }],
          },
          services: { edges: [] },
        },
      }));
      const project = await service.createProject('new-project', 'Fresh project');
      expect(project.id).toBe('proj-new');
      expect(project.name).toBe('new-project');
      expect(project.description).toBe('Fresh project');
      expect(project.environments).toHaveLength(1);
    });
  });

  // ── Services ────────────────────────────────────────────────────────────

  describe('createService', () => {
    it('should create a service and return it', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        serviceCreate: {
          id: 'svc-new',
          name: 'api-server',
          projectId: 'proj-1',
          createdAt: '2024-06-01',
          updatedAt: '2024-06-01',
        },
      }));
      const svc = await service.createService('proj-1', {
        name: 'api-server',
        source: { repo: 'user/repo' },
      });
      expect(svc.id).toBe('svc-new');
      expect(svc.name).toBe('api-server');
      expect(svc.projectId).toBe('proj-1');
    });

    it('should set variables when provided by fetching the project', async () => {
      // serviceCreate
      mockFetch.mockResolvedValueOnce(gqlResponse({
        serviceCreate: {
          id: 'svc-new',
          name: 'web',
          projectId: 'proj-1',
          createdAt: '',
          updatedAt: '',
        },
      }));
      // getProject (to find prod env)
      mockFetch.mockResolvedValueOnce(gqlResponse({
        project: {
          id: 'proj-1',
          name: 'my-project',
          description: '',
          createdAt: '',
          updatedAt: '',
          environments: {
            edges: [{ node: { id: 'env-prod', name: 'production', isEphemeral: false } }],
          },
          services: { edges: [] },
        },
      }));
      // upsertVariables
      mockFetch.mockResolvedValueOnce(gqlResponse({ variableCollectionUpsert: true }));

      const svc = await service.createService('proj-1', {
        name: 'web',
        variables: { NODE_ENV: 'production', PORT: '3000' },
      });
      expect(svc.name).toBe('web');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('redeployService', () => {
    it('should trigger redeploy and fetch latest deployment', async () => {
      // redeploy mutation
      mockFetch.mockResolvedValueOnce(gqlResponse({ serviceInstanceRedeploy: true }));
      // getLatestDeployment query
      mockFetch.mockResolvedValueOnce(gqlResponse({
        deployments: {
          edges: [
            {
              node: {
                id: 'dep-abc',
                serviceId: 'svc-1',
                environmentId: 'env-prod',
                status: 'DEPLOYING',
                createdAt: '2024-06-01',
                staticUrl: 'my-app.up.railway.app',
              },
            },
          ],
        },
      }));
      const dep = await service.redeployService('svc-1', 'env-prod');
      expect(dep.id).toBe('dep-abc');
      expect(dep.status).toBe('DEPLOYING');
      expect(dep.staticUrl).toBe('my-app.up.railway.app');
    });
  });

  describe('upsertVariables', () => {
    it('should return true on success', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ variableCollectionUpsert: true }));
      const result = await service.upsertVariables('svc-1', 'env-prod', { KEY: 'value' });
      expect(result).toBe(true);
    });

    it('should return false when mutation returns false', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ variableCollectionUpsert: false }));
      const result = await service.upsertVariables('svc-1', 'env-prod', { KEY: 'value' });
      expect(result).toBe(false);
    });
  });

  // ── Plugins (Databases) ────────────────────────────────────────────────

  describe('createPlugin', () => {
    it('should create a database plugin', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        pluginCreate: {
          id: 'plugin-pg',
          name: 'postgresql',
          status: 'provisioning',
          friendlyName: 'PostgreSQL',
        },
      }));
      const plugin = await service.createPlugin('proj-1', 'postgresql');
      expect(plugin.id).toBe('plugin-pg');
      expect(plugin.name).toBe('postgresql');
      expect(plugin.status).toBe('provisioning');
      expect(plugin.friendlyName).toBe('PostgreSQL');
    });

    it('should use plugin type as fallback for missing fields', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        pluginCreate: { id: 'plugin-redis' },
      }));
      const plugin = await service.createPlugin('proj-1', 'redis');
      expect(plugin.name).toBe('redis');
      expect(plugin.friendlyName).toBe('redis');
      expect(plugin.status).toBe('provisioning');
    });
  });

  // ── Deployments ─────────────────────────────────────────────────────────

  describe('getLatestDeployment', () => {
    it('should return the latest deployment', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        deployments: {
          edges: [
            {
              node: {
                id: 'dep-1',
                serviceId: 'svc-1',
                environmentId: 'env-prod',
                status: 'SUCCESS',
                createdAt: '2024-06-01',
                staticUrl: 'app.up.railway.app',
              },
            },
          ],
        },
      }));
      const dep = await service.getLatestDeployment('svc-1', 'env-prod');
      expect(dep.id).toBe('dep-1');
      expect(dep.status).toBe('SUCCESS');
    });

    it('should return a placeholder when no deployments exist', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ deployments: { edges: [] } }));
      const dep = await service.getLatestDeployment('svc-1', 'env-prod');
      expect(dep.id).toBe('');
      expect(dep.status).toBe('unknown');
      expect(dep.serviceId).toBe('svc-1');
      expect(dep.environmentId).toBe('env-prod');
    });
  });

  // ── Logs ────────────────────────────────────────────────────────────────

  describe('getDeploymentLogs', () => {
    it('should return deployment log entries', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        deploymentLogs: [
          { timestamp: '2024-06-01T00:00:00Z', message: 'Server started', severity: 'info' },
          { timestamp: '2024-06-01T00:00:01Z', message: 'Listening on port 3000', severity: 'info' },
        ],
      }));
      const logs = await service.getDeploymentLogs('dep-1');
      expect(logs).toHaveLength(2);
      expect(logs[0].message).toBe('Server started');
      expect(logs[1].severity).toBe('info');
    });

    it('should return empty array when no logs exist', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ deploymentLogs: [] }));
      const logs = await service.getDeploymentLogs('dep-1');
      expect(logs).toHaveLength(0);
    });

    it('should default severity to info when missing', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        deploymentLogs: [{ timestamp: '2024-06-01', message: 'hello' }],
      }));
      const logs = await service.getDeploymentLogs('dep-1');
      expect(logs[0].severity).toBe('info');
    });
  });

  describe('getBuildLogs', () => {
    it('should return build log entries', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        buildLogs: [
          { timestamp: '2024-06-01T00:00:00Z', message: 'Installing dependencies...', severity: 'info' },
          { timestamp: '2024-06-01T00:00:05Z', message: 'Build succeeded', severity: 'info' },
        ],
      }));
      const logs = await service.getBuildLogs('dep-1');
      expect(logs).toHaveLength(2);
      expect(logs[0].message).toBe('Installing dependencies...');
    });

    it('should return empty array when no build logs exist', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ buildLogs: null }));
      const logs = await service.getBuildLogs('dep-1');
      expect(logs).toHaveLength(0);
    });
  });

  // ── Request Details ─────────────────────────────────────────────────────

  describe('GraphQL request format', () => {
    it('should send Bearer token and correct content type', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ projects: { edges: [] } }));
      await service.listProjects();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://backboard.railway.com/graphql/v2');
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer railway-test-token-abc');
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('should include variables in the request body', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        project: {
          id: 'proj-1', name: 'p', description: '', createdAt: '', updatedAt: '',
          environments: { edges: [] }, services: { edges: [] },
        },
      }));
      await service.getProject('proj-1');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables).toEqual({ id: 'proj-1' });
    });
  });

  // ── Error Handling ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should include all GraphQL error messages joined by semicolons', async () => {
      mockFetch.mockResolvedValueOnce(gqlErrorResponse(['Error one', 'Error two']));
      await expect(service.listProjects()).rejects.toThrow('Railway GraphQL: Error one; Error two');
    });

    it('should handle HTTP-level errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Service Unavailable', 503));
      await expect(service.listProjects()).rejects.toThrow('Railway API 503');
    });
  });
});
