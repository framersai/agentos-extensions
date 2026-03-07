import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DOCreateAppTool } from '../src/tools/createApp.js';
import { DOCreateDropletTool } from '../src/tools/createDroplet.js';
import { DODeleteResourceTool } from '../src/tools/deleteResource.js';
import { DODeployAppTool } from '../src/tools/deployApp.js';
import { DOListResourcesTool } from '../src/tools/listResources.js';
import { DOManageDnsTool } from '../src/tools/manageDns.js';
import type { DigitalOceanService } from '../src/DigitalOceanService.js';

// ---------------------------------------------------------------------------
// Mock service factory
// ---------------------------------------------------------------------------

function createMockService(): DigitalOceanService {
  return {
    createApp: vi.fn(),
    createDroplet: vi.fn(),
    deleteApp: vi.fn(),
    deleteDroplet: vi.fn(),
    createDeployment: vi.fn(),
    listApps: vi.fn(),
    listDroplets: vi.fn(),
    listDomains: vi.fn(),
    addDomain: vi.fn(),
    listDomainRecords: vi.fn(),
    createDomainRecord: vi.fn(),
    updateDomainRecord: vi.fn(),
    deleteDomainRecord: vi.fn(),
  } as unknown as DigitalOceanService;
}

// ---------------------------------------------------------------------------
// DOCreateAppTool
// ---------------------------------------------------------------------------

describe('DOCreateAppTool', () => {
  let service: DigitalOceanService;
  let tool: DOCreateAppTool;

  beforeEach(() => {
    service = createMockService();
    tool = new DOCreateAppTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('doCreateApp');
    expect(tool.name).toBe('doCreateApp');
    expect(tool.displayName).toBe('Create DO App');
  });

  it('should require name and gitUrl', () => {
    expect(tool.inputSchema.required).toContain('name');
    expect(tool.inputSchema.required).toContain('gitUrl');
  });

  it('should return app on success', async () => {
    const mockApp = { id: 'app-1', name: 'my-app', defaultIngress: 'https://my-app.ondigitalocean.app' };
    (service.createApp as ReturnType<typeof vi.fn>).mockResolvedValue(mockApp);

    const result = await tool.execute({
      name: 'my-app',
      gitUrl: 'https://github.com/user/repo',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockApp);
  });

  it('should forward all optional parameters', async () => {
    (service.createApp as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await tool.execute({
      name: 'my-app',
      gitUrl: 'https://github.com/user/repo',
      branch: 'develop',
      region: 'sfo',
      buildCommand: 'npm run build',
      runCommand: 'npm start',
      outputDir: 'dist',
      isStatic: true,
      envVars: { NODE_ENV: 'production' },
      instanceSizeSlug: 'basic-xs',
    });

    expect(service.createApp).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: 'develop',
        region: 'sfo',
        isStatic: true,
        instanceSizeSlug: 'basic-xs',
      }),
    );
  });

  it('should return error on failure', async () => {
    (service.createApp as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Quota exceeded'));

    const result = await tool.execute({ name: 'app', gitUrl: 'https://github.com/u/r' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Quota exceeded');
  });
});

// ---------------------------------------------------------------------------
// DOCreateDropletTool
// ---------------------------------------------------------------------------

describe('DOCreateDropletTool', () => {
  let service: DigitalOceanService;
  let tool: DOCreateDropletTool;

  beforeEach(() => {
    service = createMockService();
    tool = new DOCreateDropletTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('doCreateDroplet');
    expect(tool.name).toBe('doCreateDroplet');
  });

  it('should require name, region, size, and image', () => {
    expect(tool.inputSchema.required).toEqual(['name', 'region', 'size', 'image']);
  });

  it('should return droplet on success', async () => {
    const mockDroplet = { id: 12345, name: 'my-server', status: 'new', region: { slug: 'nyc1' } };
    (service.createDroplet as ReturnType<typeof vi.fn>).mockResolvedValue(mockDroplet);

    const result = await tool.execute({
      name: 'my-server',
      region: 'nyc1',
      size: 's-1vcpu-1gb',
      image: 'ubuntu-24-04-x64',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockDroplet);
  });

  it('should forward ssh keys and tags', async () => {
    (service.createDroplet as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await tool.execute({
      name: 'srv',
      region: 'sfo3',
      size: 's-2vcpu-4gb',
      image: 'debian-12-x64',
      sshKeys: ['fingerprint1'],
      tags: ['web', 'prod'],
      backups: true,
      ipv6: true,
    });

    expect(service.createDroplet).toHaveBeenCalledWith(
      expect.objectContaining({
        sshKeys: ['fingerprint1'],
        tags: ['web', 'prod'],
        backups: true,
        ipv6: true,
      }),
    );
  });

  it('should return error on failure', async () => {
    (service.createDroplet as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid size'));

    const result = await tool.execute({
      name: 'srv', region: 'nyc1', size: 'invalid', image: 'ubuntu',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid size');
  });
});

// ---------------------------------------------------------------------------
// DODeleteResourceTool
// ---------------------------------------------------------------------------

describe('DODeleteResourceTool', () => {
  let service: DigitalOceanService;
  let tool: DODeleteResourceTool;

  beforeEach(() => {
    service = createMockService();
    tool = new DODeleteResourceTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('doDeleteResource');
    expect(tool.name).toBe('doDeleteResource');
  });

  it('should require resourceType and resourceId', () => {
    expect(tool.inputSchema.required).toContain('resourceType');
    expect(tool.inputSchema.required).toContain('resourceId');
  });

  it('should delete an app', async () => {
    (service.deleteApp as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await tool.execute({ resourceType: 'app', resourceId: 'app-uuid-123' });

    expect(result.success).toBe(true);
    expect(result.data?.message).toContain('app-uuid-123');
    expect(service.deleteApp).toHaveBeenCalledWith('app-uuid-123');
  });

  it('should delete a droplet', async () => {
    (service.deleteDroplet as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await tool.execute({ resourceType: 'droplet', resourceId: '12345' });

    expect(result.success).toBe(true);
    expect(service.deleteDroplet).toHaveBeenCalledWith(12345);
  });

  it('should return error for invalid droplet ID', async () => {
    const result = await tool.execute({ resourceType: 'droplet', resourceId: 'not-a-number' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid droplet ID');
  });

  it('should return error on service failure', async () => {
    (service.deleteApp as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));

    const result = await tool.execute({ resourceType: 'app', resourceId: 'bad-id' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// DODeployAppTool
// ---------------------------------------------------------------------------

describe('DODeployAppTool', () => {
  let service: DigitalOceanService;
  let tool: DODeployAppTool;

  beforeEach(() => {
    service = createMockService();
    tool = new DODeployAppTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('doDeployApp');
    expect(tool.name).toBe('doDeployApp');
  });

  it('should require appId', () => {
    expect(tool.inputSchema.required).toContain('appId');
  });

  it('should return deployment on success', async () => {
    const mockDeployment = { id: 'dep-1', phase: 'BUILDING', progress: {} };
    (service.createDeployment as ReturnType<typeof vi.fn>).mockResolvedValue(mockDeployment);

    const result = await tool.execute({ appId: 'app-1' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockDeployment);
    expect(service.createDeployment).toHaveBeenCalledWith('app-1', undefined);
  });

  it('should pass forceBuild parameter', async () => {
    (service.createDeployment as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await tool.execute({ appId: 'app-1', forceBuild: true });

    expect(service.createDeployment).toHaveBeenCalledWith('app-1', true);
  });

  it('should return error on failure', async () => {
    (service.createDeployment as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('App suspended'));

    const result = await tool.execute({ appId: 'bad-app' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('App suspended');
  });
});

// ---------------------------------------------------------------------------
// DOListResourcesTool
// ---------------------------------------------------------------------------

describe('DOListResourcesTool', () => {
  let service: DigitalOceanService;
  let tool: DOListResourcesTool;

  beforeEach(() => {
    service = createMockService();
    tool = new DOListResourcesTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('doListResources');
    expect(tool.name).toBe('doListResources');
  });

  it('should have no required fields', () => {
    expect(tool.inputSchema.required).toHaveLength(0);
  });

  it('should list both apps and droplets by default', async () => {
    const mockApps = [{ id: 'app-1', name: 'my-app' }];
    const mockDroplets = [{ id: 111, name: 'my-server' }];
    (service.listApps as ReturnType<typeof vi.fn>).mockResolvedValue(mockApps);
    (service.listDroplets as ReturnType<typeof vi.fn>).mockResolvedValue(mockDroplets);

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data?.apps).toEqual(mockApps);
    expect(result.data?.droplets).toEqual(mockDroplets);
  });

  it('should list only apps when resourceType is "apps"', async () => {
    (service.listApps as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await tool.execute({ resourceType: 'apps' });

    expect(result.success).toBe(true);
    expect(result.data?.apps).toEqual([]);
    expect(result.data?.droplets).toBeUndefined();
    expect(service.listDroplets).not.toHaveBeenCalled();
  });

  it('should list only droplets when resourceType is "droplets"', async () => {
    (service.listDroplets as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await tool.execute({ resourceType: 'droplets' });

    expect(result.success).toBe(true);
    expect(result.data?.droplets).toEqual([]);
    expect(result.data?.apps).toBeUndefined();
    expect(service.listApps).not.toHaveBeenCalled();
  });

  it('should return error on failure', async () => {
    (service.listApps as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));

    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// DOManageDnsTool
// ---------------------------------------------------------------------------

describe('DOManageDnsTool', () => {
  let service: DigitalOceanService;
  let tool: DOManageDnsTool;

  beforeEach(() => {
    service = createMockService();
    tool = new DOManageDnsTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('doManageDns');
    expect(tool.name).toBe('doManageDns');
  });

  it('should require action', () => {
    expect(tool.inputSchema.required).toContain('action');
  });

  it('should list domains', async () => {
    const mockDomains = [{ name: 'example.com', ttl: 1800, zone_file: '...' }];
    (service.listDomains as ReturnType<typeof vi.fn>).mockResolvedValue(mockDomains);

    const result = await tool.execute({ action: 'list-domains' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockDomains);
  });

  it('should add a domain', async () => {
    const mockDomain = { name: 'example.com', ttl: 1800 };
    (service.addDomain as ReturnType<typeof vi.fn>).mockResolvedValue(mockDomain);

    const result = await tool.execute({ action: 'add-domain', domain: 'example.com' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockDomain);
  });

  it('should validate domain for add-domain action', async () => {
    const result = await tool.execute({ action: 'add-domain' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Domain name is required');
  });

  it('should list domain records', async () => {
    const mockRecords = [{ id: 1, type: 'A', name: '@', data: '1.2.3.4' }];
    (service.listDomainRecords as ReturnType<typeof vi.fn>).mockResolvedValue(mockRecords);

    const result = await tool.execute({ action: 'list', domain: 'example.com' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockRecords);
  });

  it('should add a DNS record', async () => {
    const mockRecord = { id: 2, type: 'A', name: 'www', data: '5.6.7.8' };
    (service.createDomainRecord as ReturnType<typeof vi.fn>).mockResolvedValue(mockRecord);

    const result = await tool.execute({
      action: 'add',
      domain: 'example.com',
      recordType: 'A',
      name: 'www',
      data: '5.6.7.8',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockRecord);
  });

  it('should validate required fields for add action', async () => {
    const result = await tool.execute({
      action: 'add',
      domain: 'example.com',
      // Missing recordType, name, data
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('recordType');
  });

  it('should delete a DNS record', async () => {
    (service.deleteDomainRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await tool.execute({
      action: 'delete',
      domain: 'example.com',
      recordId: 42,
    });

    expect(result.success).toBe(true);
    expect(service.deleteDomainRecord).toHaveBeenCalledWith('example.com', 42);
  });

  it('should update a DNS record', async () => {
    const mockUpdated = { id: 42, type: 'A', name: 'www', data: '9.9.9.9' };
    (service.updateDomainRecord as ReturnType<typeof vi.fn>).mockResolvedValue(mockUpdated);

    const result = await tool.execute({
      action: 'update',
      domain: 'example.com',
      recordId: 42,
      data: '9.9.9.9',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockUpdated);
  });

  it('should return error on service failure', async () => {
    (service.listDomains as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Auth error'));

    const result = await tool.execute({ action: 'list-domains' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Auth error');
  });
});
