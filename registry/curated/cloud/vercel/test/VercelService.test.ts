// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VercelService } from '../src/VercelService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as unknown as Response;
}

const TOKEN = 'test-vercel-token';
const TEAM_ID = 'team_abc123';

function createService(teamId?: string) {
  return new VercelService({
    token: TOKEN,
    teamId,
    baseUrl: 'https://api.vercel.com',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VercelService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let service: VercelService;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    service = createService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── initialize / shutdown ─────────────────────────────────────────────

  describe('initialize', () => {
    it('should set isRunning to true on successful auth', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ user: { id: 'u1' } }));

      await service.initialize();

      expect(service.isRunning).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v2/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
          }),
        }),
      );
    });

    it('should throw on auth failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Unauthorized', 401));

      await expect(service.initialize()).rejects.toThrow('Vercel auth failed: 401');
      expect(service.isRunning).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should set isRunning to false', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ user: {} }));
      await service.initialize();
      expect(service.isRunning).toBe(true);

      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  // ── Team query parameter ──────────────────────────────────────────────

  describe('team scoping', () => {
    it('should append teamId as query param when configured', async () => {
      const teamService = createService(TEAM_ID);
      mockFetch.mockResolvedValueOnce(mockResponse({ projects: [] }));

      await teamService.listProjects();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain(`teamId=${TEAM_ID}`);
    });

    it('should use & separator when path already has query params', async () => {
      const teamService = createService(TEAM_ID);
      mockFetch.mockResolvedValueOnce(mockResponse({ projects: [] }));

      await teamService.listProjects(5);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('?limit=5&teamId=');
    });
  });

  // ── Projects ──────────────────────────────────────────────────────────

  describe('listProjects', () => {
    it('should return mapped projects', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        projects: [
          { id: 'p1', name: 'my-app', framework: 'nextjs', createdAt: 1000, updatedAt: 2000 },
          { id: 'p2', name: 'api', framework: null, createdAt: 1500, updatedAt: 2500 },
        ],
      }));

      const projects = await service.listProjects();

      expect(projects).toHaveLength(2);
      expect(projects[0]).toEqual({
        id: 'p1',
        name: 'my-app',
        framework: 'nextjs',
        createdAt: 1000,
        updatedAt: 2000,
        latestDeployments: undefined,
        link: undefined,
      });
    });

    it('should pass limit as query parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ projects: [] }));

      await service.listProjects(5);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=5');
    });

    it('should return empty array when no projects', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ projects: undefined }));

      const projects = await service.listProjects();
      expect(projects).toEqual([]);
    });
  });

  describe('getProject', () => {
    it('should return a single mapped project', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'p1',
        name: 'my-app',
        framework: 'nextjs',
        createdAt: 1000,
        updatedAt: 2000,
        link: { type: 'github', repo: 'my-app', org: 'acme' },
      }));

      const project = await service.getProject('my-app');

      expect(project.id).toBe('p1');
      expect(project.link).toEqual({ type: 'github', repo: 'my-app', org: 'acme' });
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));

      await expect(service.getProject('nonexistent')).rejects.toThrow('Vercel API 404');
    });
  });

  describe('createProject', () => {
    it('should create a project linked to a GitHub repo', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'p-new',
        name: 'my-app',
        framework: 'nextjs',
        createdAt: 3000,
        updatedAt: 3000,
      }));

      const project = await service.createProject('my-app', 'https://github.com/acme/my-app', {
        framework: 'nextjs',
      });

      expect(project.id).toBe('p-new');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.gitRepository).toEqual({ type: 'github', repo: 'acme/my-app' });
      expect(body.framework).toBe('nextjs');
    });

    it('should detect GitLab provider', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'p-gl', name: 'gl-app', framework: null, createdAt: 0, updatedAt: 0,
      }));

      await service.createProject('gl-app', 'https://gitlab.com/org/gl-app');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.gitRepository.type).toBe('gitlab');
    });

    it('should throw for unparseable git URL', async () => {
      await expect(
        service.createProject('bad', 'https://example.com/repo'),
      ).rejects.toThrow('Cannot parse git URL');
    });
  });

  // ── Deployments ───────────────────────────────────────────────────────

  describe('createDeployment', () => {
    it('should trigger a production deployment by default', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'dpl_1',
        url: 'my-app-abc.vercel.app',
        readyState: 'BUILDING',
        inspectorUrl: 'https://vercel.com/inspect/dpl_1',
        projectId: 'p1',
      }));

      const result = await service.createDeployment('my-app');

      expect(result.id).toBe('dpl_1');
      expect(result.url).toBe('https://my-app-abc.vercel.app');
      expect(result.readyState).toBe('BUILDING');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.target).toBe('production');
    });

    it('should include gitRef when provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'dpl_2', url: 'x.vercel.app', readyState: 'QUEUED', projectId: 'p1',
      }));

      await service.createDeployment('my-app', { target: 'preview', gitRef: 'feature/xyz' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.target).toBe('preview');
      expect(body.gitSource).toEqual({ ref: 'feature/xyz' });
    });
  });

  describe('deployFromGit', () => {
    it('should create project if it does not exist, set env vars, then deploy', async () => {
      // getProject -> 404
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));
      // createProject -> success
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'p-new', name: 'my-repo', framework: null, createdAt: 0, updatedAt: 0,
      }));
      // setEnvVars -> POST env
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));
      // createDeployment
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'dpl_3', url: 'my-repo.vercel.app', readyState: 'BUILDING', projectId: 'p-new',
      }));

      const result = await service.deployFromGit({
        gitUrl: 'https://github.com/acme/my-repo',
        envVars: { NODE_ENV: 'production' },
      });

      expect(result.id).toBe('dpl_3');
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should reuse existing project when it exists', async () => {
      // getProject -> success
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'p-existing', name: 'my-repo', framework: null, createdAt: 0, updatedAt: 0,
      }));
      // createDeployment
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'dpl_4', url: 'my-repo.vercel.app', readyState: 'BUILDING', projectId: 'p-existing',
      }));

      const result = await service.deployFromGit({
        gitUrl: 'https://github.com/acme/my-repo',
      });

      expect(result.id).toBe('dpl_4');
      // No createProject call, no setEnvVars call
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDeployment', () => {
    it('should return mapped deployment', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        uid: 'dpl_1', name: 'my-app', url: 'https://my-app.vercel.app',
        state: 'READY', created: 5000, inspectorUrl: 'https://inspect/1',
      }));

      const deployment = await service.getDeployment('dpl_1');

      expect(deployment.uid).toBe('dpl_1');
      expect(deployment.state).toBe('READY');
      expect(deployment.url).toBe('https://my-app.vercel.app');
    });

    it('should prefix url with https if missing', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        uid: 'dpl_2', name: 'app', url: 'app-xyz.vercel.app', state: 'BUILDING', created: 0,
      }));

      const deployment = await service.getDeployment('dpl_2');
      expect(deployment.url).toBe('https://app-xyz.vercel.app');
    });
  });

  describe('listDeployments', () => {
    it('should return mapped deployments with projectId filter', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        deployments: [
          { uid: 'd1', name: 'a', url: 'a.vercel.app', state: 'READY', created: 100 },
          { uid: 'd2', name: 'b', url: 'b.vercel.app', state: 'BUILDING', created: 200 },
        ],
      }));

      const deps = await service.listDeployments('p1', 5);

      expect(deps).toHaveLength(2);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('projectId=p1');
      expect(url).toContain('limit=5');
    });
  });

  // ── Domains ───────────────────────────────────────────────────────────

  describe('addDomain', () => {
    it('should add a domain to a project', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        name: 'example.com', verified: true, configured: false,
      }));

      const domain = await service.addDomain('p1', 'example.com');

      expect(domain.name).toBe('example.com');
      expect(domain.verified).toBe(true);
      expect(domain.configured).toBe(false);
    });

    it('should forward optional domain settings', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        name: 'old.example.com', verified: true, configured: true,
        redirect: 'new.example.com', redirectStatusCode: 301,
      }));

      const domain = await service.addDomain('p1', 'old.example.com', {
        redirect: 'new.example.com',
        redirectStatusCode: 301,
      });

      expect(domain.redirect).toBe('new.example.com');
      expect(domain.redirectStatusCode).toBe(301);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.redirect).toBe('new.example.com');
    });
  });

  describe('removeDomain', () => {
    it('should send DELETE request', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

      await service.removeDomain('p1', 'example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v9/projects/p1/domains/example.com'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('listDomains', () => {
    it('should return mapped domain list', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        domains: [
          { name: 'a.com', verified: true, configured: true },
          { name: 'b.com', verified: false, configured: false },
        ],
      }));

      const domains = await service.listDomains('p1');
      expect(domains).toHaveLength(2);
      expect(domains[0].name).toBe('a.com');
    });
  });

  describe('getDomainConfig', () => {
    it('should return domain DNS configuration', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        configuredBy: 'CNAME',
        nameservers: ['ns1.vercel-dns.com'],
        misconfigured: false,
        cnames: ['cname.vercel-dns.com'],
        aValues: ['76.76.21.21'],
      }));

      const config = await service.getDomainConfig('example.com');

      expect(config.configuredBy).toBe('CNAME');
      expect(config.misconfigured).toBe(false);
      expect(config.aValues).toContain('76.76.21.21');
    });
  });

  // ── Environment Variables ─────────────────────────────────────────────

  describe('setEnvVars', () => {
    it('should create env vars via POST', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

      await service.setEnvVars('p1', { API_KEY: 'abc', SECRET: 'xyz' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.key).toBe('API_KEY');
      expect(body.type).toBe('encrypted');
    });

    it('should patch env var when it already exists', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(
        { error: { code: 'ENV_ALREADY_EXISTS', envId: 'env_123' } },
        409,
      ));
      // PATCH call
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

      await service.setEnvVars('p1', { EXISTING_KEY: 'new-value' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const patchUrl = mockFetch.mock.calls[1][0] as string;
      expect(patchUrl).toContain('/env/env_123');
    });
  });

  describe('listEnvVars', () => {
    it('should return mapped env vars', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        envs: [
          { key: 'NODE_ENV', value: 'production', target: ['production'], type: 'plain' },
          { key: 'SECRET', target: ['production', 'preview'], type: 'encrypted' },
        ],
      }));

      const vars = await service.listEnvVars('p1');

      expect(vars).toHaveLength(2);
      expect(vars[0].key).toBe('NODE_ENV');
      expect(vars[0].value).toBe('production');
      expect(vars[1].value).toBe('(encrypted)');
    });
  });
});
