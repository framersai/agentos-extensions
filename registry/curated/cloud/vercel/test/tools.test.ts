// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VercelDeployTool } from '../src/tools/deploy.js';
import { VercelListProjectsTool } from '../src/tools/listProjects.js';
import { VercelGetDeploymentTool } from '../src/tools/getDeployment.js';
import { VercelSetEnvVarsTool } from '../src/tools/setEnvVars.js';
import { VercelConfigureDomainTool } from '../src/tools/configureDomain.js';
import type { VercelService } from '../src/VercelService.js';

// ---------------------------------------------------------------------------
// Mock service factory
// ---------------------------------------------------------------------------

function createMockService(): VercelService {
  return {
    deployFromGit: vi.fn(),
    listProjects: vi.fn(),
    getDeployment: vi.fn(),
    setEnvVars: vi.fn(),
    listEnvVars: vi.fn(),
    addDomain: vi.fn(),
    removeDomain: vi.fn(),
    listDomains: vi.fn(),
    getDomainConfig: vi.fn(),
  } as unknown as VercelService;
}

// ---------------------------------------------------------------------------
// VercelDeployTool
// ---------------------------------------------------------------------------

describe('VercelDeployTool', () => {
  let service: VercelService;
  let tool: VercelDeployTool;

  beforeEach(() => {
    service = createMockService();
    tool = new VercelDeployTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('vercelDeploy');
    expect(tool.name).toBe('vercelDeploy');
    expect(tool.displayName).toBe('Deploy to Vercel');
  });

  it('should require gitUrl in inputSchema', () => {
    expect(tool.inputSchema.required).toContain('gitUrl');
    expect(tool.inputSchema.properties.gitUrl).toBeDefined();
  });

  it('should return success on successful deploy', async () => {
    const mockResult = { id: 'dpl_1', url: 'https://app.vercel.app', readyState: 'BUILDING', inspectorUrl: '', projectId: 'p1' };
    (service.deployFromGit as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const result = await tool.execute({ gitUrl: 'https://github.com/user/repo' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResult);
    expect(service.deployFromGit).toHaveBeenCalledWith(
      expect.objectContaining({ gitUrl: 'https://github.com/user/repo' }),
    );
  });

  it('should forward optional parameters to service', async () => {
    (service.deployFromGit as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await tool.execute({
      gitUrl: 'https://github.com/user/repo',
      projectName: 'my-proj',
      framework: 'nextjs',
      buildCommand: 'npm run build',
      outputDirectory: '.next',
      envVars: { NODE_ENV: 'production' },
    });

    expect(service.deployFromGit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'my-proj',
        framework: 'nextjs',
        buildCommand: 'npm run build',
        outputDirectory: '.next',
        envVars: { NODE_ENV: 'production' },
      }),
    );
  });

  it('should return error on failure', async () => {
    (service.deployFromGit as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Auth failed'));

    const result = await tool.execute({ gitUrl: 'https://github.com/user/repo' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Auth failed');
  });
});

// ---------------------------------------------------------------------------
// VercelListProjectsTool
// ---------------------------------------------------------------------------

describe('VercelListProjectsTool', () => {
  let service: VercelService;
  let tool: VercelListProjectsTool;

  beforeEach(() => {
    service = createMockService();
    tool = new VercelListProjectsTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('vercelListProjects');
    expect(tool.name).toBe('vercelListProjects');
  });

  it('should have no required fields', () => {
    expect(tool.inputSchema.required).toHaveLength(0);
  });

  it('should return projects on success', async () => {
    const mockProjects = [
      { id: 'p1', name: 'app-1', framework: 'nextjs', createdAt: 1000, updatedAt: 2000 },
    ];
    (service.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockProjects);

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockProjects);
    expect(service.listProjects).toHaveBeenCalledWith(20);
  });

  it('should pass custom limit', async () => {
    (service.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await tool.execute({ limit: 5 });

    expect(service.listProjects).toHaveBeenCalledWith(5);
  });

  it('should return error on failure', async () => {
    (service.listProjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));

    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toBe('API error');
  });
});

// ---------------------------------------------------------------------------
// VercelGetDeploymentTool
// ---------------------------------------------------------------------------

describe('VercelGetDeploymentTool', () => {
  let service: VercelService;
  let tool: VercelGetDeploymentTool;

  beforeEach(() => {
    service = createMockService();
    tool = new VercelGetDeploymentTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('vercelGetDeployment');
    expect(tool.name).toBe('vercelGetDeployment');
  });

  it('should require deploymentId', () => {
    expect(tool.inputSchema.required).toContain('deploymentId');
  });

  it('should return deployment on success', async () => {
    const mockDeployment = {
      uid: 'dpl_1', name: 'app', url: 'https://app.vercel.app',
      state: 'READY' as const, created: 5000,
    };
    (service.getDeployment as ReturnType<typeof vi.fn>).mockResolvedValue(mockDeployment);

    const result = await tool.execute({ deploymentId: 'dpl_1' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockDeployment);
  });

  it('should return error on failure', async () => {
    (service.getDeployment as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));

    const result = await tool.execute({ deploymentId: 'bad_id' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// VercelSetEnvVarsTool
// ---------------------------------------------------------------------------

describe('VercelSetEnvVarsTool', () => {
  let service: VercelService;
  let tool: VercelSetEnvVarsTool;

  beforeEach(() => {
    service = createMockService();
    tool = new VercelSetEnvVarsTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('vercelSetEnvVars');
    expect(tool.name).toBe('vercelSetEnvVars');
  });

  it('should require projectId', () => {
    expect(tool.inputSchema.required).toContain('projectId');
  });

  it('should set env vars and return count', async () => {
    (service.setEnvVars as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await tool.execute({
      projectId: 'p1',
      vars: { API_KEY: 'abc', SECRET: 'xyz' },
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ set: 2 });
    expect(service.setEnvVars).toHaveBeenCalledWith(
      'p1',
      { API_KEY: 'abc', SECRET: 'xyz' },
      ['production', 'preview', 'development'],
    );
  });

  it('should list env vars when action is "list"', async () => {
    const mockVars = [{ key: 'NODE_ENV', value: 'production', target: ['production'], type: 'plain' }];
    (service.listEnvVars as ReturnType<typeof vi.fn>).mockResolvedValue(mockVars);

    const result = await tool.execute({ projectId: 'p1', action: 'list' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockVars);
  });

  it('should return error when no vars provided for set action', async () => {
    const result = await tool.execute({ projectId: 'p1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No environment variables');
  });

  it('should return error on service failure', async () => {
    (service.setEnvVars as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Forbidden'));

    const result = await tool.execute({ projectId: 'p1', vars: { KEY: 'val' } });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
  });
});

// ---------------------------------------------------------------------------
// VercelConfigureDomainTool
// ---------------------------------------------------------------------------

describe('VercelConfigureDomainTool', () => {
  let service: VercelService;
  let tool: VercelConfigureDomainTool;

  beforeEach(() => {
    service = createMockService();
    tool = new VercelConfigureDomainTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('vercelConfigureDomain');
    expect(tool.name).toBe('vercelConfigureDomain');
  });

  it('should require projectId and domain', () => {
    expect(tool.inputSchema.required).toContain('projectId');
    expect(tool.inputSchema.required).toContain('domain');
  });

  it('should add a domain and check DNS config', async () => {
    const mockDomain = { name: 'example.com', verified: true, configured: false };
    (service.addDomain as ReturnType<typeof vi.fn>).mockResolvedValue(mockDomain);
    (service.getDomainConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ misconfigured: true });

    const result = await tool.execute({ projectId: 'p1', domain: 'example.com' });

    expect(result.success).toBe(true);
    expect(service.addDomain).toHaveBeenCalledWith('p1', 'example.com', { gitBranch: undefined });
  });

  it('should remove a domain', async () => {
    (service.removeDomain as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await tool.execute({ projectId: 'p1', domain: 'example.com', action: 'remove' });

    expect(result.success).toBe(true);
    expect(service.removeDomain).toHaveBeenCalledWith('p1', 'example.com');
  });

  it('should list domains', async () => {
    const mockDomains = [{ name: 'a.com', verified: true, configured: true }];
    (service.listDomains as ReturnType<typeof vi.fn>).mockResolvedValue(mockDomains);

    const result = await tool.execute({ projectId: 'p1', domain: 'a.com', action: 'list' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockDomains);
  });

  it('should check DNS configuration', async () => {
    (service.getDomainConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ misconfigured: false });

    const result = await tool.execute({ projectId: 'p1', domain: 'example.com', action: 'check' });

    expect(result.success).toBe(true);
    expect((result.data as any).dnsInstructions).toContain('properly configured');
  });

  it('should return error on failure', async () => {
    (service.addDomain as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Project not found'));

    const result = await tool.execute({ projectId: 'bad', domain: 'x.com' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Project not found');
  });
});
