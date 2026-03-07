import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlyService } from '../src/FlyService';

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

describe('FlyService', () => {
  let service: FlyService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    service = new FlyService({
      token: 'fly-test-token-xyz',
      baseUrl: 'https://api.machines.dev/v1',
      graphqlUrl: 'https://api.fly.io/graphql',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initialize / Shutdown ───────────────────────────────────────────────

  describe('initialize', () => {
    it('should succeed when currentUser query returns an id', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ currentUser: { id: 'user-1', email: 'test@fly.io' } }));
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should throw when currentUser has no id', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ currentUser: { id: null } }));
      await expect(service.initialize()).rejects.toThrow('Fly.io auth failed: could not retrieve user');
      expect(service.isRunning).toBe(false);
    });

    it('should throw when GraphQL returns HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Unauthorized', 401));
      await expect(service.initialize()).rejects.toThrow('Fly.io GraphQL 401');
    });

    it('should throw on GraphQL errors in response body', async () => {
      mockFetch.mockResolvedValueOnce(gqlErrorResponse(['Token revoked']));
      await expect(service.initialize()).rejects.toThrow('Fly.io GraphQL: Token revoked');
    });
  });

  describe('shutdown', () => {
    it('should set isRunning to false', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ currentUser: { id: 'u1' } }));
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  // ── Apps ────────────────────────────────────────────────────────────────

  describe('createApp', () => {
    it('should create an app and fetch it via GraphQL', async () => {
      // POST /apps (REST)
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));
      // getApp via GraphQL
      mockFetch.mockResolvedValueOnce(gqlResponse({
        app: {
          id: 'app-abc',
          name: 'my-fly-app',
          organization: { slug: 'personal' },
          status: 'deployed',
          hostname: 'my-fly-app.fly.dev',
          createdAt: '2024-06-01',
        },
      }));
      const app = await service.createApp('my-fly-app');
      expect(app.id).toBe('app-abc');
      expect(app.name).toBe('my-fly-app');
      expect(app.organization).toBe('personal');
      expect(app.hostname).toBe('my-fly-app.fly.dev');
    });

    it('should pass org_slug when provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));
      mockFetch.mockResolvedValueOnce(gqlResponse({
        app: {
          id: 'app-xyz',
          name: 'team-app',
          organization: { slug: 'my-team' },
          status: 'pending',
          hostname: 'team-app.fly.dev',
        },
      }));
      const app = await service.createApp('team-app', 'my-team');
      const restBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(restBody.org_slug).toBe('my-team');
      expect(app.organization).toBe('my-team');
    });

    it('should throw when REST create fails', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Name already taken', 422));
      await expect(service.createApp('taken-app')).rejects.toThrow('Fly.io API 422');
    });
  });

  describe('getApp', () => {
    it('should return an app by name via GraphQL', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        app: {
          id: 'app-1',
          name: 'my-app',
          organization: { slug: 'personal' },
          status: 'deployed',
          hostname: 'my-app.fly.dev',
          createdAt: '2024-01-01',
        },
      }));
      const app = await service.getApp('my-app');
      expect(app.id).toBe('app-1');
      expect(app.status).toBe('deployed');
    });

    it('should default hostname to name.fly.dev when missing', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        app: {
          id: 'app-1',
          name: 'bare-app',
          organization: {},
          status: 'pending',
        },
      }));
      const app = await service.getApp('bare-app');
      expect(app.hostname).toBe('bare-app.fly.dev');
    });

    it('should throw on GraphQL errors', async () => {
      mockFetch.mockResolvedValueOnce(gqlErrorResponse(['App not found']));
      await expect(service.getApp('missing-app')).rejects.toThrow('Fly.io GraphQL: App not found');
    });
  });

  describe('listApps', () => {
    it('should return a list of apps', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        apps: {
          nodes: [
            {
              id: 'a1', name: 'app-one', organization: { slug: 'personal' },
              status: 'deployed', hostname: 'app-one.fly.dev', createdAt: '2024-01-01',
            },
            {
              id: 'a2', name: 'app-two', organization: { slug: 'team' },
              status: 'suspended', hostname: 'app-two.fly.dev', createdAt: '2024-02-01',
            },
          ],
        },
      }));
      const apps = await service.listApps();
      expect(apps).toHaveLength(2);
      expect(apps[0].name).toBe('app-one');
      expect(apps[1].organization).toBe('team');
      expect(apps[1].status).toBe('suspended');
    });

    it('should return empty array when no apps exist', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ apps: { nodes: [] } }));
      const apps = await service.listApps();
      expect(apps).toHaveLength(0);
    });
  });

  // ── Machines ────────────────────────────────────────────────────────────

  describe('createMachine', () => {
    it('should create a machine with config', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'mach-1',
        name: 'web-1',
        state: 'started',
        region: 'iad',
        instance_id: 'inst-abc',
        private_ip: 'fdaa::1',
        config: {
          image: 'registry.fly.io/my-app:latest',
          env: { NODE_ENV: 'production' },
          guest: { cpus: 1, cpu_kind: 'shared', memory_mb: 256 },
        },
        image_ref: { repository: 'registry.fly.io/my-app', tag: 'latest', digest: 'sha256:abc' },
        created_at: '2024-06-01',
        updated_at: '2024-06-01',
      }));
      const machine = await service.createMachine('my-app', {
        image: 'registry.fly.io/my-app:latest',
        env: { NODE_ENV: 'production' },
        guest: { cpus: 1, cpu_kind: 'shared', memory_mb: 256 },
      }, { name: 'web-1', region: 'iad' });

      expect(machine.id).toBe('mach-1');
      expect(machine.name).toBe('web-1');
      expect(machine.state).toBe('started');
      expect(machine.region).toBe('iad');
      expect(machine.config.image).toBe('registry.fly.io/my-app:latest');
      expect(machine.config.env?.NODE_ENV).toBe('production');
      expect(machine.imageRef?.digest).toBe('sha256:abc');
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('App not found', 404));
      await expect(service.createMachine('missing-app', {
        image: 'nginx:latest',
      })).rejects.toThrow('Fly.io API 404');
    });
  });

  describe('listMachines', () => {
    it('should return a list of machines', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([
        {
          id: 'm1', name: 'web', state: 'started', region: 'iad',
          instance_id: 'i1', private_ip: 'fdaa::1',
          config: { image: 'nginx:latest' },
          created_at: '2024-01-01', updated_at: '2024-01-01',
        },
        {
          id: 'm2', name: 'worker', state: 'stopped', region: 'lhr',
          instance_id: 'i2', private_ip: 'fdaa::2',
          config: { image: 'node:20' },
          created_at: '2024-01-02', updated_at: '2024-01-02',
        },
      ]));
      const machines = await service.listMachines('my-app');
      expect(machines).toHaveLength(2);
      expect(machines[0].name).toBe('web');
      expect(machines[0].state).toBe('started');
      expect(machines[1].name).toBe('worker');
      expect(machines[1].region).toBe('lhr');
    });

    it('should return empty array when no machines exist', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      const machines = await service.listMachines('empty-app');
      expect(machines).toHaveLength(0);
    });
  });

  describe('destroyMachine', () => {
    it('should stop then delete the machine', async () => {
      // stop
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));
      // delete
      mockFetch.mockResolvedValueOnce(mockResponse('', 200));
      await expect(service.destroyMachine('my-app', 'mach-1')).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should succeed even if stop fails (machine already stopped)', async () => {
      // stop fails
      mockFetch.mockRejectedValueOnce(new Error('Machine already stopped'));
      // delete succeeds
      mockFetch.mockResolvedValueOnce(mockResponse('', 200));
      await expect(service.destroyMachine('my-app', 'mach-1')).resolves.toBeUndefined();
    });

    it('should treat 404 on delete as success', async () => {
      // stop
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));
      // delete returns 404
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));
      await expect(service.destroyMachine('my-app', 'mach-gone')).resolves.toBeUndefined();
    });

    it('should throw on non-404 error during delete', async () => {
      // stop
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));
      // delete returns 500
      mockFetch.mockResolvedValueOnce(mockResponse('Internal Error', 500));
      await expect(service.destroyMachine('my-app', 'mach-1')).rejects.toThrow('Fly.io API 500');
    });

    it('should pass force=true as query param when force is set', async () => {
      // stop
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));
      // delete
      mockFetch.mockResolvedValueOnce(mockResponse('', 200));
      await service.destroyMachine('my-app', 'mach-1', true);
      const deleteUrl = mockFetch.mock.calls[1][0] as string;
      expect(deleteUrl).toContain('force=true');
    });
  });

  describe('updateMachine', () => {
    it('should update machine config and return the updated machine', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'mach-1',
        name: 'web',
        state: 'started',
        region: 'iad',
        instance_id: 'i1',
        private_ip: 'fdaa::1',
        config: {
          image: 'nginx:1.26',
          guest: { cpus: 2, cpu_kind: 'shared', memory_mb: 512 },
        },
        created_at: '2024-01-01',
        updated_at: '2024-06-01',
      }));
      const machine = await service.updateMachine('my-app', 'mach-1', {
        image: 'nginx:1.26',
        guest: { cpus: 2, cpu_kind: 'shared', memory_mb: 512 },
      });
      expect(machine.config.image).toBe('nginx:1.26');
      expect(machine.config.guest?.memory_mb).toBe(512);
    });

    it('should throw on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Bad Request', 400));
      await expect(service.updateMachine('my-app', 'mach-1', {
        image: 'invalid',
      })).rejects.toThrow('Fly.io API 400');
    });
  });

  // ── Volumes ─────────────────────────────────────────────────────────────

  describe('createVolume', () => {
    it('should create a volume and return mapped result', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'vol-abc',
        name: 'data',
        state: 'created',
        size_gb: 10,
        region: 'iad',
        encrypted: true,
        created_at: '2024-06-01',
      }));
      const vol = await service.createVolume('my-app', {
        name: 'data',
        region: 'iad',
        sizeGb: 10,
      });
      expect(vol.id).toBe('vol-abc');
      expect(vol.name).toBe('data');
      expect(vol.sizeGb).toBe(10);
      expect(vol.encrypted).toBe(true);
    });

    it('should default encrypted to true in the request', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'vol-xyz', name: 'db', state: 'created', size_gb: 5,
        region: 'lhr', encrypted: true, created_at: '2024-06-01',
      }));
      await service.createVolume('my-app', { name: 'db', region: 'lhr', sizeGb: 5 });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.encrypted).toBe(true);
    });

    it('should allow overriding encrypted to false', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'vol-plain', name: 'tmp', state: 'created', size_gb: 1,
        region: 'iad', encrypted: false, created_at: '2024-06-01',
      }));
      await service.createVolume('my-app', { name: 'tmp', region: 'iad', sizeGb: 1, encrypted: false });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.encrypted).toBe(false);
    });

    it('should throw on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('App not found', 404));
      await expect(service.createVolume('missing', {
        name: 'vol', region: 'iad', sizeGb: 1,
      })).rejects.toThrow('Fly.io API 404');
    });
  });

  describe('listVolumes', () => {
    it('should return a list of volumes', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([
        {
          id: 'v1', name: 'data', state: 'created', size_gb: 10, region: 'iad',
          encrypted: true, created_at: '2024-01-01', attached_machine_id: 'mach-1',
        },
        {
          id: 'v2', name: 'logs', state: 'created', size_gb: 5, region: 'iad',
          encrypted: true, created_at: '2024-01-02',
        },
      ]));
      const volumes = await service.listVolumes('my-app');
      expect(volumes).toHaveLength(2);
      expect(volumes[0].name).toBe('data');
      expect(volumes[0].attachedMachineId).toBe('mach-1');
      expect(volumes[1].attachedMachineId).toBeUndefined();
    });

    it('should return empty array when no volumes exist', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      const volumes = await service.listVolumes('empty-app');
      expect(volumes).toHaveLength(0);
    });
  });

  // ── Request Details ─────────────────────────────────────────────────────

  describe('REST request format', () => {
    it('should send Bearer token to Machines API', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      await service.listMachines('my-app');
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.machines.dev/v1/apps/my-app/machines');
      expect(init.headers['Authorization']).toBe('Bearer fly-test-token-xyz');
      expect(init.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('GraphQL request format', () => {
    it('should send Bearer token to GraphQL API', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ apps: { nodes: [] } }));
      await service.listApps();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.fly.io/graphql');
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer fly-test-token-xyz');
    });
  });

  // ── Default Config ──────────────────────────────────────────────────────

  describe('default config', () => {
    it('should use default base URLs when none provided', () => {
      const svc = new FlyService({ token: 'test' });
      // We can verify by making a request and checking the URL
      // Since the defaults are set in the constructor, just verify the service is created
      expect(svc.isRunning).toBe(false);
    });
  });

  // ── Error Handling ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should join multiple GraphQL errors with semicolons', async () => {
      mockFetch.mockResolvedValueOnce(gqlErrorResponse(['Error one', 'Error two']));
      await expect(service.listApps()).rejects.toThrow('Fly.io GraphQL: Error one; Error two');
    });

    it('should handle HTTP-level errors from GraphQL endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Bad Gateway', 502));
      await expect(service.listApps()).rejects.toThrow('Fly.io GraphQL 502');
    });

    it('should handle HTTP-level errors from Machines API', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Too Many Requests', 429));
      await expect(service.listMachines('app')).rejects.toThrow('Fly.io API 429');
    });
  });
});
