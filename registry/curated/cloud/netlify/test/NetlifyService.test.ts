import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetlifyService } from '../src/NetlifyService.js';

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

const TOKEN = 'test-netlify-token';

function createService() {
  return new NetlifyService({
    token: TOKEN,
    baseUrl: 'https://api.netlify.com/api/v1',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NetlifyService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let service: NetlifyService;

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
    it('should set isRunning on valid token', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'u1', email: 'test@example.com' }));

      await service.initialize();

      expect(service.isRunning).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.netlify.com/api/v1/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
          }),
        }),
      );
    });

    it('should throw on auth failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Unauthorized', 401));

      await expect(service.initialize()).rejects.toThrow('Netlify auth failed: 401');
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

  // ── Sites ─────────────────────────────────────────────────────────────

  describe('listSites', () => {
    it('should return mapped sites', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([
        {
          id: 's1', name: 'my-site', url: 'https://my-site.netlify.app',
          ssl_url: 'https://my-site.netlify.app', admin_url: 'https://app.netlify.com/sites/my-site',
          state: 'ready', created_at: '2024-01-01', updated_at: '2024-01-02',
          default_domain: 'my-site.netlify.app', custom_domain: null,
        },
      ]));

      const sites = await service.listSites();

      expect(sites).toHaveLength(1);
      expect(sites[0].id).toBe('s1');
      expect(sites[0].name).toBe('my-site');
      expect(sites[0].custom_domain).toBeNull();
    });

    it('should pass per_page limit', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      await service.listSites(5);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('per_page=5');
    });
  });

  describe('getSite', () => {
    it('should return a single mapped site', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's1', name: 'my-site', url: 'https://my-site.netlify.app',
        ssl_url: 'https://my-site.netlify.app', admin_url: 'https://app.netlify.com/sites/my-site',
        state: 'ready', created_at: '2024-01-01', updated_at: '2024-01-02',
        default_domain: 'my-site.netlify.app', custom_domain: 'example.com',
        build_settings: { cmd: 'npm run build', dir: 'dist', repo_url: 'https://github.com/acme/app', repo_branch: 'main' },
      }));

      const site = await service.getSite('my-site');

      expect(site.custom_domain).toBe('example.com');
      expect(site.build_settings?.cmd).toBe('npm run build');
    });

    it('should throw on 404', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));

      await expect(service.getSite('nope')).rejects.toThrow('Netlify API 404');
    });
  });

  describe('createSite', () => {
    it('should create a site with name only', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's-new', name: 'basic-site', url: '', ssl_url: '', admin_url: '',
        state: 'new', created_at: '', updated_at: '',
        default_domain: 'basic-site.netlify.app', custom_domain: null,
      }));

      const site = await service.createSite('basic-site');

      expect(site.name).toBe('basic-site');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.name).toBe('basic-site');
      expect(body.repo).toBeUndefined();
    });

    it('should include repo config when repoUrl is provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's-repo', name: 'repo-site', url: '', ssl_url: '', admin_url: '',
        state: 'new', created_at: '', updated_at: '',
        default_domain: 'repo-site.netlify.app', custom_domain: null,
      }));

      await service.createSite('repo-site', {
        repoUrl: 'https://github.com/acme/repo-site',
        branch: 'develop',
        buildCommand: 'npm run build',
        publishDirectory: 'dist',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.repo.provider).toBe('github');
      expect(body.repo.repo).toBe('acme/repo-site');
      expect(body.repo.repo_branch).toBe('develop');
      expect(body.repo.cmd).toBe('npm run build');
    });

    it('should detect GitLab provider from URL', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's-gl', name: 'gl-site', url: '', ssl_url: '', admin_url: '',
        state: 'new', created_at: '', updated_at: '',
        default_domain: 'gl-site.netlify.app', custom_domain: null,
      }));

      await service.createSite('gl-site', {
        repoUrl: 'https://gitlab.com/org/gl-site',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.repo.provider).toBe('gitlab');
    });

    it('should throw for unparseable git URL', async () => {
      await expect(
        service.createSite('bad', { repoUrl: 'ftp://bad-host/repo' }),
      ).rejects.toThrow('Cannot parse git URL');
    });
  });

  describe('updateSite', () => {
    it('should send PUT with updated settings', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's1', name: 'renamed', url: '', ssl_url: '', admin_url: '',
        state: 'ready', created_at: '', updated_at: '',
        default_domain: 'renamed.netlify.app', custom_domain: 'custom.com',
      }));

      const site = await service.updateSite('s1', {
        name: 'renamed',
        customDomain: 'custom.com',
        buildCommand: 'npm run build',
      });

      expect(site.name).toBe('renamed');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.name).toBe('renamed');
      expect(body.custom_domain).toBe('custom.com');
      expect(body.build_settings.cmd).toBe('npm run build');
    });
  });

  // ── Deployments ───────────────────────────────────────────────────────

  describe('createDeploy', () => {
    it('should trigger a deploy for a site', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'dep-1', site_id: 's1', state: 'building',
        url: 'https://dep-1--my-site.netlify.app', ssl_url: 'https://dep-1--my-site.netlify.app',
        admin_url: '', deploy_url: '', created_at: '', updated_at: '',
      }));

      const deploy = await service.createDeploy('s1', { title: 'Manual deploy', clearCache: true });

      expect(deploy.id).toBe('dep-1');
      expect(deploy.state).toBe('building');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.title).toBe('Manual deploy');
      expect(body.clear_cache).toBe(true);
    });
  });

  describe('getDeploy', () => {
    it('should return a deploy status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'dep-1', site_id: 's1', state: 'ready',
        url: 'https://my-site.netlify.app', ssl_url: 'https://my-site.netlify.app',
        admin_url: '', deploy_url: '', created_at: '', updated_at: '',
        error_message: null, branch: 'main', commit_ref: 'abc123',
      }));

      const deploy = await service.getDeploy('s1', 'dep-1');

      expect(deploy.state).toBe('ready');
      expect(deploy.commit_ref).toBe('abc123');
    });
  });

  describe('deployFromGit', () => {
    it('should create site if not found, set env vars, and deploy', async () => {
      // getSite -> 404
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));
      // createSite
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's-auto', name: 'my-repo', url: 'https://my-repo.netlify.app',
        ssl_url: 'https://my-repo.netlify.app', admin_url: 'https://app.netlify.com/sites/my-repo',
        state: 'new', created_at: '', updated_at: '',
        default_domain: 'my-repo.netlify.app', custom_domain: null,
      }));
      // setEnvVars -> getSite (account_slug lookup)
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's-auto', name: 'my-repo', url: '', ssl_url: '', admin_url: '',
        state: 'new', created_at: '', updated_at: '',
        default_domain: 'my-repo.netlify.app', custom_domain: null,
        account_slug: 'my-account',
      }));
      // setEnvVars -> PUT env var
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));
      // createDeploy
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'dep-auto', site_id: 's-auto', state: 'building',
        url: 'https://my-repo.netlify.app', ssl_url: 'https://my-repo.netlify.app',
        admin_url: 'https://app.netlify.com/sites/my-repo', deploy_url: '',
        created_at: '', updated_at: '',
      }));

      const result = await service.deployFromGit({
        gitUrl: 'https://github.com/acme/my-repo',
        envVars: { SECRET: 'val' },
      });

      expect(result.id).toBe('dep-auto');
      expect(result.siteName).toBe('my-repo');
      expect(result.state).toBe('building');
    });

    it('should reuse existing site when found', async () => {
      // getSite -> success
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's-exist', name: 'my-repo', url: 'https://my-repo.netlify.app',
        ssl_url: 'https://my-repo.netlify.app', admin_url: '',
        state: 'ready', created_at: '', updated_at: '',
        default_domain: 'my-repo.netlify.app', custom_domain: null,
      }));
      // createDeploy
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'dep-2', site_id: 's-exist', state: 'building',
        url: '', ssl_url: '', admin_url: '', deploy_url: '',
        created_at: '', updated_at: '',
      }));

      const result = await service.deployFromGit({
        gitUrl: 'https://github.com/acme/my-repo',
      });

      expect(result.siteId).toBe('s-exist');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('listDeploys', () => {
    it('should return mapped deploy list', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([
        { id: 'd1', site_id: 's1', state: 'ready', url: '', ssl_url: '', admin_url: '', deploy_url: '', created_at: '', updated_at: '' },
        { id: 'd2', site_id: 's1', state: 'error', url: '', ssl_url: '', admin_url: '', deploy_url: '', created_at: '', updated_at: '', error_message: 'Build failed' },
      ]));

      const deploys = await service.listDeploys('s1');

      expect(deploys).toHaveLength(2);
      expect(deploys[1].error_message).toBe('Build failed');
    });
  });

  // ── Domains ───────────────────────────────────────────────────────────

  describe('setCustomDomain', () => {
    it('should update the site with a custom domain', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's1', name: 'my-site', url: '', ssl_url: '', admin_url: '',
        state: 'ready', created_at: '', updated_at: '',
        default_domain: 'my-site.netlify.app', custom_domain: 'example.com',
      }));

      const site = await service.setCustomDomain('s1', 'example.com');

      expect(site.custom_domain).toBe('example.com');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.custom_domain).toBe('example.com');
    });
  });

  describe('getDnsZone', () => {
    it('should return zone with records when found', async () => {
      // list zones
      mockFetch.mockResolvedValueOnce(mockResponse([
        { id: 'z1', name: 'example.com' },
        { id: 'z2', name: 'other.com' },
      ]));
      // list records for z1
      mockFetch.mockResolvedValueOnce(mockResponse([
        { hostname: 'example.com', type: 'A', value: '1.2.3.4', ttl: 3600 },
        { hostname: 'www.example.com', type: 'CNAME', value: 'example.com', ttl: 3600 },
      ]));

      const zone = await service.getDnsZone('example.com');

      expect(zone).not.toBeNull();
      expect(zone!.id).toBe('z1');
      expect(zone!.records).toHaveLength(2);
    });

    it('should return null when no zone matches', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      const zone = await service.getDnsZone('notfound.com');
      expect(zone).toBeNull();
    });
  });

  describe('listDomainAliases', () => {
    it('should return default domain and custom domain', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's1', name: 'my-site', url: '', ssl_url: 'https://my-site.netlify.app',
        admin_url: '', state: 'ready', created_at: '', updated_at: '',
        default_domain: 'my-site.netlify.app', custom_domain: 'example.com',
      }));

      const domains = await service.listDomainAliases('s1');

      expect(domains).toHaveLength(2);
      expect(domains[0].hostname).toBe('example.com');
      expect(domains[1].hostname).toBe('my-site.netlify.app');
    });

    it('should return only default domain when no custom domain', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's1', name: 'my-site', url: '', ssl_url: 'https://my-site.netlify.app',
        admin_url: '', state: 'ready', created_at: '', updated_at: '',
        default_domain: 'my-site.netlify.app', custom_domain: null,
      }));

      const domains = await service.listDomainAliases('s1');

      expect(domains).toHaveLength(1);
      expect(domains[0].hostname).toBe('my-site.netlify.app');
    });
  });

  // ── Environment Variables ─────────────────────────────────────────────

  describe('setEnvVars', () => {
    it('should set env vars via account-level endpoint', async () => {
      // getSite (to get account_slug)
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's1', name: 'my-site', url: '', ssl_url: '', admin_url: '',
        state: 'ready', created_at: '', updated_at: '',
        default_domain: 'my-site.netlify.app', custom_domain: null,
        account_slug: 'my-team',
      }));
      // PUT env var
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

      await service.setEnvVars('s1', { API_KEY: 'secret' });

      const putUrl = mockFetch.mock.calls[1][0] as string;
      expect(putUrl).toContain('/accounts/my-team/env/API_KEY');
      expect(putUrl).toContain('site_id=s1');
    });

    it('should fallback to build_settings env when no account_slug', async () => {
      // getSite (no account_slug)
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's1', name: 'my-site', url: '', ssl_url: '', admin_url: '',
        state: 'ready', created_at: '', updated_at: '',
        default_domain: 'my-site.netlify.app', custom_domain: null,
      }));
      // PUT site update
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

      await service.setEnvVars('s1', { DB_URL: 'postgres://...' });

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.build_settings.env.DB_URL).toBe('postgres://...');
    });

    it('should fall back to POST if PUT returns non-OK', async () => {
      // getSite
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's1', name: 'my-site', url: '', ssl_url: '', admin_url: '',
        state: 'ready', created_at: '', updated_at: '',
        default_domain: 'my-site.netlify.app', custom_domain: null,
        account_slug: 'my-team',
      }));
      // PUT -> 404 (env doesn't exist yet)
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));
      // POST create
      mockFetch.mockResolvedValueOnce(mockResponse({}, 201));

      await service.setEnvVars('s1', { NEW_VAR: 'value' });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      const postUrl = mockFetch.mock.calls[2][0] as string;
      expect(postUrl).toContain('/accounts/my-team/env');
    });
  });

  describe('listEnvVars', () => {
    it('should return env vars from account-level endpoint', async () => {
      // getSite
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's1', name: 'my-site', url: '', ssl_url: '', admin_url: '',
        state: 'ready', created_at: '', updated_at: '',
        default_domain: 'my-site.netlify.app', custom_domain: null,
        account_slug: 'my-team',
      }));
      // GET env vars
      mockFetch.mockResolvedValueOnce(mockResponse([
        { key: 'API_KEY', scopes: ['builds', 'runtime'], values: [{ value: 'abc', context: 'production' }] },
      ]));

      const vars = await service.listEnvVars('s1');

      expect(vars).toHaveLength(1);
      expect(vars[0].key).toBe('API_KEY');
      expect(vars[0].values[0].value).toBe('abc');
    });

    it('should return empty array when no env vars', async () => {
      // getSite (no account_slug, no build env)
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 's1', name: 'my-site', url: '', ssl_url: '', admin_url: '',
        state: 'ready', created_at: '', updated_at: '',
        default_domain: 'my-site.netlify.app', custom_domain: null,
      }));

      const vars = await service.listEnvVars('s1');
      expect(vars).toEqual([]);
    });
  });
});
