// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HerokuService } from '../src/HerokuService';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HerokuService', () => {
  let service: HerokuService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    service = new HerokuService({
      apiKey: 'heroku-test-token-123',
      baseUrl: 'https://api.heroku.com',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initialize / Shutdown ───────────────────────────────────────────────

  describe('initialize', () => {
    it('should succeed when /account returns 200', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'user-1', email: 'test@test.com' }));
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should throw when /account returns non-OK status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Invalid credentials', 401));
      await expect(service.initialize()).rejects.toThrow('Heroku auth failed: 401');
      expect(service.isRunning).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should set isRunning to false', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'u1' }));
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  // ── Apps ────────────────────────────────────────────────────────────────

  describe('createApp', () => {
    it('should create an app with provided options', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'app-abc',
        name: 'my-app',
        region: { name: 'us' },
        stack: { name: 'heroku-24' },
        web_url: 'https://my-app.herokuapp.com',
        git_url: 'https://git.heroku.com/my-app.git',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        maintenance: false,
      }));
      const app = await service.createApp({ name: 'my-app', region: 'us' });
      expect(app.id).toBe('app-abc');
      expect(app.name).toBe('my-app');
      expect(app.region).toBe('us');
      expect(app.stack).toBe('heroku-24');
      expect(app.webUrl).toBe('https://my-app.herokuapp.com');
    });

    it('should create an app with no options', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'app-xyz',
        name: 'random-name',
        region: { name: 'us' },
        stack: { name: 'heroku-24' },
        web_url: 'https://random-name.herokuapp.com',
        git_url: 'https://git.heroku.com/random-name.git',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }));
      const app = await service.createApp();
      expect(app.name).toBe('random-name');
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Name is already taken', 422));
      await expect(service.createApp({ name: 'taken' })).rejects.toThrow('Heroku API 422');
    });
  });

  describe('listApps', () => {
    it('should return a list of apps', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([
        {
          id: 'a1', name: 'app-one', region: { name: 'us' }, stack: { name: 'heroku-24' },
          web_url: 'https://app-one.herokuapp.com', git_url: '', created_at: '', updated_at: '',
        },
        {
          id: 'a2', name: 'app-two', region: { name: 'eu' }, stack: { name: 'heroku-24' },
          web_url: 'https://app-two.herokuapp.com', git_url: '', created_at: '', updated_at: '',
        },
      ]));
      const apps = await service.listApps();
      expect(apps).toHaveLength(2);
      expect(apps[0].name).toBe('app-one');
      expect(apps[1].region).toBe('eu');
    });

    it('should return empty array when no apps exist', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      const apps = await service.listApps();
      expect(apps).toHaveLength(0);
    });
  });

  describe('getApp', () => {
    it('should return a single app', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'a1', name: 'my-app', region: { name: 'us' }, stack: { name: 'heroku-24' },
        web_url: 'https://my-app.herokuapp.com', git_url: '', created_at: '', updated_at: '',
      }));
      const app = await service.getApp('my-app');
      expect(app.name).toBe('my-app');
    });

    it('should throw on 404', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));
      await expect(service.getApp('missing')).rejects.toThrow('Heroku API 404');
    });
  });

  describe('deleteApp', () => {
    it('should succeed on 200', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));
      await expect(service.deleteApp('my-app')).resolves.toBeUndefined();
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Forbidden', 403));
      await expect(service.deleteApp('protected-app')).rejects.toThrow('Heroku API 403');
    });
  });

  // ── Builds ──────────────────────────────────────────────────────────────

  describe('createBuild', () => {
    it('should create a build from a source URL', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'build-123',
        app: { id: 'app-abc' },
        status: 'pending',
        output_stream_url: 'https://stream.heroku.com/build-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_blob: { url: 'https://example.com/source.tgz', version: 'v1.0' },
      }));
      const build = await service.createBuild('my-app', 'https://example.com/source.tgz', 'v1.0');
      expect(build.id).toBe('build-123');
      expect(build.status).toBe('pending');
      expect(build.sourceBlob.url).toBe('https://example.com/source.tgz');
      expect(build.sourceBlob.version).toBe('v1.0');
    });

    it('should throw on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Invalid source', 422));
      await expect(service.createBuild('my-app', 'bad-url')).rejects.toThrow('Heroku API 422');
    });
  });

  describe('getBuild', () => {
    it('should retrieve build status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'build-123',
        app: { id: 'app-abc' },
        status: 'successful',
        output_stream_url: '',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:30:00Z',
        source_blob: { url: 'https://example.com/source.tgz' },
      }));
      const build = await service.getBuild('my-app', 'build-123');
      expect(build.status).toBe('successful');
    });
  });

  // ── Config Vars ─────────────────────────────────────────────────────────

  describe('getConfigVars', () => {
    it('should return config vars as key-value pairs', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        DATABASE_URL: 'postgres://...',
        NODE_ENV: 'production',
      }));
      const vars = await service.getConfigVars('my-app');
      expect(vars.DATABASE_URL).toBe('postgres://...');
      expect(vars.NODE_ENV).toBe('production');
    });
  });

  describe('updateConfigVars', () => {
    it('should merge config vars and return updated set', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        DATABASE_URL: 'postgres://...',
        NODE_ENV: 'staging',
        NEW_VAR: 'value',
      }));
      const vars = await service.updateConfigVars('my-app', {
        NODE_ENV: 'staging',
        NEW_VAR: 'value',
      });
      expect(vars.NODE_ENV).toBe('staging');
      expect(vars.NEW_VAR).toBe('value');
    });

    it('should throw on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Forbidden', 403));
      await expect(service.updateConfigVars('app', { KEY: 'val' })).rejects.toThrow('Heroku API 403');
    });
  });

  // ── Addons ──────────────────────────────────────────────────────────────

  describe('addAddon', () => {
    it('should provision an addon and return addon info', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'addon-abc',
        name: 'postgresql-curved-12345',
        plan: { id: 'plan-1', name: 'heroku-postgresql:essential-0', price: { cents: 500, unit: 'month' } },
        state: 'provisioning',
        app: { id: 'app-abc' },
        web_url: 'https://addons.heroku.com/addon-abc',
        config_vars: ['DATABASE_URL'],
      }));
      const addon = await service.addAddon('my-app', 'heroku-postgresql:essential-0');
      expect(addon.id).toBe('addon-abc');
      expect(addon.plan.name).toBe('heroku-postgresql:essential-0');
      expect(addon.state).toBe('provisioning');
      expect(addon.configVars).toContain('DATABASE_URL');
    });
  });

  describe('listAddons', () => {
    it('should return a list of addons', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([
        {
          id: 'addon-1', name: 'pg', plan: { id: 'p1', name: 'pg:hobby', price: { cents: 0, unit: 'month' } },
          state: 'provisioned', app: { id: 'a1' }, config_vars: ['DATABASE_URL'],
        },
      ]));
      const addons = await service.listAddons('my-app');
      expect(addons).toHaveLength(1);
      expect(addons[0].name).toBe('pg');
    });
  });

  // ── Logs ────────────────────────────────────────────────────────────────

  describe('createLogSession', () => {
    it('should create a log session with options', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'log-sess-1',
        logplex_url: 'https://logplex.heroku.com/sessions/abc',
        created_at: '2024-01-01T00:00:00Z',
      }));
      const session = await service.createLogSession('my-app', {
        lines: 100,
        tail: true,
        source: 'app',
      });
      expect(session.id).toBe('log-sess-1');
      expect(session.logplexUrl).toBe('https://logplex.heroku.com/sessions/abc');
    });
  });

  describe('fetchLogs', () => {
    it('should return log text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('2024-01-01T00:00:00Z app[web.1]: Starting process'),
      } as unknown as Response);
      const logs = await service.fetchLogs('https://logplex.heroku.com/sessions/abc');
      expect(logs).toContain('Starting process');
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 410,
        text: vi.fn().mockResolvedValue('Session expired'),
      } as unknown as Response);
      await expect(service.fetchLogs('https://logplex.heroku.com/sessions/expired')).rejects.toThrow('Log fetch failed: 410');
    });
  });

  // ── Formation (Dynos) ──────────────────────────────────────────────────

  describe('scaleDynos', () => {
    it('should scale a dyno type and return formation info', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'form-1',
        type: 'web',
        quantity: 3,
        size: 'standard-1x',
        command: 'npm start',
      }));
      const formation = await service.scaleDynos('my-app', 'web', 3, 'standard-1x');
      expect(formation.type).toBe('web');
      expect(formation.quantity).toBe(3);
      expect(formation.size).toBe('standard-1x');
    });

    it('should throw on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));
      await expect(service.scaleDynos('missing', 'web', 1)).rejects.toThrow('Heroku API 404');
    });
  });

  describe('listFormation', () => {
    it('should return all dyno formations', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([
        { id: 'f1', type: 'web', quantity: 2, size: 'basic', command: 'npm start' },
        { id: 'f2', type: 'worker', quantity: 1, size: 'basic', command: 'npm run worker' },
      ]));
      const formations = await service.listFormation('my-app');
      expect(formations).toHaveLength(2);
      expect(formations[0].type).toBe('web');
      expect(formations[1].type).toBe('worker');
    });
  });

  // ── Request Headers ─────────────────────────────────────────────────────

  describe('request headers', () => {
    it('should send correct authorization and accept headers', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      await service.listApps();
      const callInit = mockFetch.mock.calls[0][1];
      expect(callInit.headers['Authorization']).toBe('Bearer heroku-test-token-123');
      expect(callInit.headers['Accept']).toBe('application/vnd.heroku+json; version=3');
      expect(callInit.headers['Content-Type']).toBe('application/json');
    });
  });
});
