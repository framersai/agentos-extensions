// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetlifyDeployTool } from '../src/tools/deploy.js';
import { NetlifyListSitesTool } from '../src/tools/listSites.js';
import { NetlifySetEnvVarsTool } from '../src/tools/setEnvVars.js';
import { NetlifyConfigureDomainTool } from '../src/tools/configureDomain.js';
import type { NetlifyService } from '../src/NetlifyService.js';

// ---------------------------------------------------------------------------
// Mock service factory
// ---------------------------------------------------------------------------

function createMockService(): NetlifyService {
  return {
    deployFromGit: vi.fn(),
    listSites: vi.fn(),
    setEnvVars: vi.fn(),
    listEnvVars: vi.fn(),
    setCustomDomain: vi.fn(),
    updateSite: vi.fn(),
    listDomainAliases: vi.fn(),
    getDnsZone: vi.fn(),
  } as unknown as NetlifyService;
}

// ---------------------------------------------------------------------------
// NetlifyDeployTool
// ---------------------------------------------------------------------------

describe('NetlifyDeployTool', () => {
  let service: NetlifyService;
  let tool: NetlifyDeployTool;

  beforeEach(() => {
    service = createMockService();
    tool = new NetlifyDeployTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('netlifyDeploySite');
    expect(tool.name).toBe('netlifyDeploySite');
    expect(tool.displayName).toBe('Deploy to Netlify');
  });

  it('should require gitUrl', () => {
    expect(tool.inputSchema.required).toContain('gitUrl');
  });

  it('should return success on successful deploy', async () => {
    const mockResult = {
      id: 'site-1', url: 'https://my-site.netlify.app',
      sslUrl: 'https://my-site.netlify.app', state: 'current',
    };
    (service.deployFromGit as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const result = await tool.execute({ gitUrl: 'https://github.com/user/repo' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResult);
  });

  it('should forward optional parameters', async () => {
    (service.deployFromGit as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await tool.execute({
      gitUrl: 'https://github.com/user/repo',
      siteName: 'my-site',
      buildCommand: 'npm run build',
      publishDirectory: 'dist',
      branch: 'develop',
      envVars: { API_KEY: 'abc' },
    });

    expect(service.deployFromGit).toHaveBeenCalledWith(
      expect.objectContaining({
        siteName: 'my-site',
        buildCommand: 'npm run build',
        publishDirectory: 'dist',
        branch: 'develop',
        envVars: { API_KEY: 'abc' },
      }),
    );
  });

  it('should return error on failure', async () => {
    (service.deployFromGit as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Deploy failed'));

    const result = await tool.execute({ gitUrl: 'https://github.com/user/repo' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Deploy failed');
  });
});

// ---------------------------------------------------------------------------
// NetlifyListSitesTool
// ---------------------------------------------------------------------------

describe('NetlifyListSitesTool', () => {
  let service: NetlifyService;
  let tool: NetlifyListSitesTool;

  beforeEach(() => {
    service = createMockService();
    tool = new NetlifyListSitesTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('netlifyListSites');
    expect(tool.name).toBe('netlifyListSites');
  });

  it('should have no required fields', () => {
    expect(tool.inputSchema.required).toHaveLength(0);
  });

  it('should return sites on success', async () => {
    const mockSites = [{ id: 's1', name: 'my-site', url: 'https://my-site.netlify.app' }];
    (service.listSites as ReturnType<typeof vi.fn>).mockResolvedValue(mockSites);

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockSites);
    expect(service.listSites).toHaveBeenCalledWith(20);
  });

  it('should pass custom limit', async () => {
    (service.listSites as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await tool.execute({ limit: 50 });

    expect(service.listSites).toHaveBeenCalledWith(50);
  });

  it('should return error on failure', async () => {
    (service.listSites as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));

    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// NetlifySetEnvVarsTool
// ---------------------------------------------------------------------------

describe('NetlifySetEnvVarsTool', () => {
  let service: NetlifyService;
  let tool: NetlifySetEnvVarsTool;

  beforeEach(() => {
    service = createMockService();
    tool = new NetlifySetEnvVarsTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('netlifySetEnvVars');
    expect(tool.name).toBe('netlifySetEnvVars');
  });

  it('should require siteId', () => {
    expect(tool.inputSchema.required).toContain('siteId');
  });

  it('should set env vars and return count', async () => {
    (service.setEnvVars as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await tool.execute({
      siteId: 's1',
      vars: { API_KEY: 'abc', SECRET: 'xyz' },
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ set: 2 });
    expect(service.setEnvVars).toHaveBeenCalledWith('s1', { API_KEY: 'abc', SECRET: 'xyz' }, 'all');
  });

  it('should pass custom context', async () => {
    (service.setEnvVars as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await tool.execute({
      siteId: 's1',
      vars: { KEY: 'val' },
      context: 'production',
    });

    expect(service.setEnvVars).toHaveBeenCalledWith('s1', { KEY: 'val' }, 'production');
  });

  it('should list env vars when action is "list"', async () => {
    const mockVars = [{ key: 'NODE_ENV', scopes: ['builds'], values: [{ value: 'production' }] }];
    (service.listEnvVars as ReturnType<typeof vi.fn>).mockResolvedValue(mockVars);

    const result = await tool.execute({ siteId: 's1', action: 'list' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockVars);
  });

  it('should return error when no vars provided for set action', async () => {
    const result = await tool.execute({ siteId: 's1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No environment variables');
  });

  it('should return error on service failure', async () => {
    (service.setEnvVars as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Site not found'));

    const result = await tool.execute({ siteId: 'bad', vars: { K: 'V' } });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Site not found');
  });
});

// ---------------------------------------------------------------------------
// NetlifyConfigureDomainTool
// ---------------------------------------------------------------------------

describe('NetlifyConfigureDomainTool', () => {
  let service: NetlifyService;
  let tool: NetlifyConfigureDomainTool;

  beforeEach(() => {
    service = createMockService();
    tool = new NetlifyConfigureDomainTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('netlifyConfigureDomain');
    expect(tool.name).toBe('netlifyConfigureDomain');
  });

  it('should require siteId and domain', () => {
    expect(tool.inputSchema.required).toContain('siteId');
    expect(tool.inputSchema.required).toContain('domain');
  });

  it('should add a domain with DNS instructions', async () => {
    const mockSite = { ssl_url: 'https://my-site.netlify.app', default_domain: 'my-site.netlify.app' };
    (service.setCustomDomain as ReturnType<typeof vi.fn>).mockResolvedValue(mockSite);

    const result = await tool.execute({ siteId: 's1', domain: 'example.com' });

    expect(result.success).toBe(true);
    expect((result.data as any).dnsInstructions).toBeDefined();
    expect(service.setCustomDomain).toHaveBeenCalledWith('s1', 'example.com');
  });

  it('should provide CNAME instructions for subdomain', async () => {
    const mockSite = { ssl_url: 'https://my-site.netlify.app', default_domain: 'my-site.netlify.app' };
    (service.setCustomDomain as ReturnType<typeof vi.fn>).mockResolvedValue(mockSite);

    const result = await tool.execute({ siteId: 's1', domain: 'www.example.com' });

    expect(result.success).toBe(true);
    expect((result.data as any).dnsInstructions).toContain('CNAME');
  });

  it('should remove a domain', async () => {
    (service.updateSite as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await tool.execute({ siteId: 's1', domain: 'example.com', action: 'remove' });

    expect(result.success).toBe(true);
    expect((result.data as any).dnsInstructions).toContain('removed');
  });

  it('should list domain aliases', async () => {
    const mockDomains = [{ hostname: 'example.com', configured: true }];
    (service.listDomainAliases as ReturnType<typeof vi.fn>).mockResolvedValue(mockDomains);

    const result = await tool.execute({ siteId: 's1', domain: 'example.com', action: 'list' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockDomains);
  });

  it('should check DNS with existing zone', async () => {
    (service.getDnsZone as ReturnType<typeof vi.fn>).mockResolvedValue({
      records: [{ type: 'A', hostname: '@', value: '75.2.60.5' }],
    });

    const result = await tool.execute({ siteId: 's1', domain: 'example.com', action: 'check' });

    expect(result.success).toBe(true);
    expect((result.data as any).dnsInstructions).toContain('1 DNS record');
  });

  it('should check DNS with no zone found', async () => {
    (service.getDnsZone as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await tool.execute({ siteId: 's1', domain: 'example.com', action: 'check' });

    expect(result.success).toBe(true);
    expect((result.data as any).dnsInstructions).toContain('No Netlify DNS zone');
  });

  it('should return error on failure', async () => {
    (service.setCustomDomain as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Site not found'));

    const result = await tool.execute({ siteId: 'bad', domain: 'x.com' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Site not found');
  });
});
