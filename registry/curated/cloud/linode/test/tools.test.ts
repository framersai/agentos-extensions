// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinodeCreateInstanceTool } from '../src/tools/createInstance.js';
import { LinodeCreateNodeBalancerTool } from '../src/tools/createNodeBalancer.js';
import { LinodeDeleteInstanceTool } from '../src/tools/deleteInstance.js';
import { LinodeDeployStackScriptTool } from '../src/tools/deployStackScript.js';
import { LinodeListInstancesTool } from '../src/tools/listInstances.js';
import { LinodeManageDnsTool } from '../src/tools/manageDns.js';
import type { LinodeService } from '../src/LinodeService.js';

// ---------------------------------------------------------------------------
// Mock service factory
// ---------------------------------------------------------------------------

function createMockService(): LinodeService {
  return {
    createInstance: vi.fn(),
    deleteInstance: vi.fn(),
    listInstances: vi.fn(),
    createNodeBalancer: vi.fn(),
    createDomain: vi.fn(),
    listDomains: vi.fn(),
    createDomainRecord: vi.fn(),
    listDomainRecords: vi.fn(),
    updateDomainRecord: vi.fn(),
    deleteDomainRecord: vi.fn(),
  } as unknown as LinodeService;
}

// ---------------------------------------------------------------------------
// LinodeCreateInstanceTool
// ---------------------------------------------------------------------------

describe('LinodeCreateInstanceTool', () => {
  let service: LinodeService;
  let tool: LinodeCreateInstanceTool;

  beforeEach(() => {
    service = createMockService();
    tool = new LinodeCreateInstanceTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('linodeCreateInstance');
    expect(tool.name).toBe('linodeCreateInstance');
    expect(tool.displayName).toBe('Create Linode Instance');
  });

  it('should require region, plan, image, and rootPass', () => {
    expect(tool.inputSchema.required).toEqual(['region', 'plan', 'image', 'rootPass']);
  });

  it('should return instance on success', async () => {
    const mockInstance = {
      id: 12345, label: 'my-linode', status: 'provisioning',
      region: 'us-east', type: 'g6-nanode-1', ipv4: ['1.2.3.4'],
    };
    (service.createInstance as ReturnType<typeof vi.fn>).mockResolvedValue(mockInstance);

    const result = await tool.execute({
      region: 'us-east',
      plan: 'g6-nanode-1',
      image: 'linode/ubuntu22.04',
      rootPass: 'SecureP@ss1',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockInstance);
  });

  it('should map plan to type in service call', async () => {
    (service.createInstance as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await tool.execute({
      region: 'us-east',
      plan: 'g6-standard-2',
      image: 'linode/debian12',
      rootPass: 'Pass123!',
      label: 'web-server',
      tags: ['prod'],
      authorizedKeys: ['ssh-rsa AAAA...'],
      backupsEnabled: true,
      privateIp: true,
    });

    expect(service.createInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'g6-standard-2',
        root_pass: 'Pass123!',
        label: 'web-server',
        tags: ['prod'],
        authorized_keys: ['ssh-rsa AAAA...'],
        backups_enabled: true,
        private_ip: true,
      }),
    );
  });

  it('should return error on failure', async () => {
    (service.createInstance as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid plan'));

    const result = await tool.execute({
      region: 'us-east', plan: 'invalid', image: 'linode/ubuntu22.04', rootPass: 'p',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid plan');
  });
});

// ---------------------------------------------------------------------------
// LinodeCreateNodeBalancerTool
// ---------------------------------------------------------------------------

describe('LinodeCreateNodeBalancerTool', () => {
  let service: LinodeService;
  let tool: LinodeCreateNodeBalancerTool;

  beforeEach(() => {
    service = createMockService();
    tool = new LinodeCreateNodeBalancerTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('linodeCreateNodeBalancer');
    expect(tool.name).toBe('linodeCreateNodeBalancer');
  });

  it('should require region', () => {
    expect(tool.inputSchema.required).toContain('region');
  });

  it('should return node balancer on success', async () => {
    const mockNB = { id: 100, label: 'my-nb', hostname: 'nb-1.linodeobjects.com', region: 'us-east' };
    (service.createNodeBalancer as ReturnType<typeof vi.fn>).mockResolvedValue(mockNB);

    const result = await tool.execute({ region: 'us-east' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockNB);
  });

  it('should forward config with backend nodes', async () => {
    (service.createNodeBalancer as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await tool.execute({
      region: 'us-east',
      label: 'web-lb',
      clientConnThrottle: 10,
      tags: ['prod'],
      config: {
        port: 443,
        protocol: 'https',
        algorithm: 'roundrobin',
        check: 'http',
        checkPath: '/health',
        checkInterval: 30,
        checkTimeout: 5,
        checkAttempts: 3,
        stickiness: 'http_cookie',
        nodes: [
          { address: '192.168.1.1:80', label: 'node-1', weight: 100, mode: 'accept' },
          { address: '192.168.1.2:80', label: 'node-2', weight: 50, mode: 'accept' },
        ],
      },
    });

    expect(service.createNodeBalancer).toHaveBeenCalledWith(
      'us-east',
      expect.objectContaining({
        label: 'web-lb',
        client_conn_throttle: 10,
        tags: ['prod'],
        configs: expect.arrayContaining([
          expect.objectContaining({
            port: 443,
            protocol: 'https',
            check_path: '/health',
            nodes: expect.arrayContaining([
              expect.objectContaining({ address: '192.168.1.1:80', label: 'node-1' }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('should return error on failure', async () => {
    (service.createNodeBalancer as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Region unavailable'));

    const result = await tool.execute({ region: 'invalid' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Region unavailable');
  });
});

// ---------------------------------------------------------------------------
// LinodeDeleteInstanceTool
// ---------------------------------------------------------------------------

describe('LinodeDeleteInstanceTool', () => {
  let service: LinodeService;
  let tool: LinodeDeleteInstanceTool;

  beforeEach(() => {
    service = createMockService();
    tool = new LinodeDeleteInstanceTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('linodeDeleteInstance');
    expect(tool.name).toBe('linodeDeleteInstance');
  });

  it('should require instanceId', () => {
    expect(tool.inputSchema.required).toContain('instanceId');
  });

  it('should delete instance and return confirmation', async () => {
    (service.deleteInstance as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await tool.execute({ instanceId: 12345 });

    expect(result.success).toBe(true);
    expect(result.data?.deleted).toBe(true);
    expect(result.data?.instanceId).toBe(12345);
    expect(result.data?.message).toContain('12345');
    expect(service.deleteInstance).toHaveBeenCalledWith(12345);
  });

  it('should return error on failure', async () => {
    (service.deleteInstance as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));

    const result = await tool.execute({ instanceId: 99999 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// LinodeDeployStackScriptTool
// ---------------------------------------------------------------------------

describe('LinodeDeployStackScriptTool', () => {
  let service: LinodeService;
  let tool: LinodeDeployStackScriptTool;

  beforeEach(() => {
    service = createMockService();
    tool = new LinodeDeployStackScriptTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('linodeDeployStackScript');
    expect(tool.name).toBe('linodeDeployStackScript');
  });

  it('should require stackscriptId, region, plan, image, rootPass', () => {
    expect(tool.inputSchema.required).toEqual([
      'stackscriptId', 'region', 'plan', 'image', 'rootPass',
    ]);
  });

  it('should deploy with stackscript and return instance', async () => {
    const mockInstance = {
      id: 54321, label: 'ss-instance', status: 'provisioning',
      region: 'us-east', type: 'g6-nanode-1',
    };
    (service.createInstance as ReturnType<typeof vi.fn>).mockResolvedValue(mockInstance);

    const result = await tool.execute({
      stackscriptId: 999,
      region: 'us-east',
      plan: 'g6-nanode-1',
      image: 'linode/ubuntu22.04',
      rootPass: 'Secure!Pass1',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockInstance);
  });

  it('should forward stackscript data and optional params', async () => {
    (service.createInstance as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await tool.execute({
      stackscriptId: 999,
      region: 'eu-west',
      plan: 'g6-standard-2',
      image: 'linode/debian12',
      rootPass: 'Pass!123',
      stackscriptData: { db_password: 'secret', app_name: 'my-app' },
      label: 'my-server',
      tags: ['automated'],
      authorizedKeys: ['ssh-ed25519 AAAA...'],
      backupsEnabled: true,
      privateIp: true,
    });

    expect(service.createInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        stackscript_id: 999,
        stackscript_data: { db_password: 'secret', app_name: 'my-app' },
        type: 'g6-standard-2',
        root_pass: 'Pass!123',
        label: 'my-server',
        authorized_keys: ['ssh-ed25519 AAAA...'],
        backups_enabled: true,
        private_ip: true,
      }),
    );
  });

  it('should return error on failure', async () => {
    (service.createInstance as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('StackScript not found'));

    const result = await tool.execute({
      stackscriptId: 0, region: 'us-east', plan: 'g6-nanode-1',
      image: 'linode/ubuntu22.04', rootPass: 'p',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('StackScript not found');
  });
});

// ---------------------------------------------------------------------------
// LinodeListInstancesTool
// ---------------------------------------------------------------------------

describe('LinodeListInstancesTool', () => {
  let service: LinodeService;
  let tool: LinodeListInstancesTool;

  beforeEach(() => {
    service = createMockService();
    tool = new LinodeListInstancesTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('linodeListInstances');
    expect(tool.name).toBe('linodeListInstances');
  });

  it('should have no required fields', () => {
    expect(tool.inputSchema.required).toHaveLength(0);
  });

  it('should return instances with total count', async () => {
    const mockResult = {
      instances: [{ id: 1, label: 'web-1', status: 'running' }],
      total: 1,
    };
    (service.listInstances as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data?.instances).toHaveLength(1);
    expect(result.data?.total).toBe(1);
    expect(service.listInstances).toHaveBeenCalledWith(1, 100);
  });

  it('should pass custom page and pageSize', async () => {
    (service.listInstances as ReturnType<typeof vi.fn>).mockResolvedValue({ instances: [], total: 0 });

    await tool.execute({ page: 3, pageSize: 50 });

    expect(service.listInstances).toHaveBeenCalledWith(3, 50);
  });

  it('should return error on failure', async () => {
    (service.listInstances as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Token expired'));

    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Token expired');
  });
});

// ---------------------------------------------------------------------------
// LinodeManageDnsTool
// ---------------------------------------------------------------------------

describe('LinodeManageDnsTool', () => {
  let service: LinodeService;
  let tool: LinodeManageDnsTool;

  beforeEach(() => {
    service = createMockService();
    tool = new LinodeManageDnsTool(service);
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('linodeManageDns');
    expect(tool.name).toBe('linodeManageDns');
  });

  it('should require action', () => {
    expect(tool.inputSchema.required).toContain('action');
  });

  it('should create a DNS zone', async () => {
    const mockZone = { id: 1, domain: 'example.com', type: 'master', status: 'active' };
    (service.createDomain as ReturnType<typeof vi.fn>).mockResolvedValue(mockZone);

    const result = await tool.execute({
      action: 'createZone',
      domain: 'example.com',
      soaEmail: 'admin@example.com',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockZone);
  });

  it('should validate domain for createZone', async () => {
    const result = await tool.execute({ action: 'createZone', soaEmail: 'a@b.com' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('domain');
  });

  it('should validate soaEmail for createZone', async () => {
    const result = await tool.execute({ action: 'createZone', domain: 'example.com' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('soaEmail');
  });

  it('should list DNS zones', async () => {
    const mockResult = { domains: [{ id: 1, domain: 'example.com' }] };
    (service.listDomains as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const result = await tool.execute({ action: 'listZones' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResult.domains);
  });

  it('should add a DNS record', async () => {
    const mockRecord = { id: 42, type: 'A', name: 'www', target: '1.2.3.4' };
    (service.createDomainRecord as ReturnType<typeof vi.fn>).mockResolvedValue(mockRecord);

    const result = await tool.execute({
      action: 'addRecord',
      domainId: 1,
      recordType: 'A',
      name: 'www',
      target: '1.2.3.4',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockRecord);
  });

  it('should validate required fields for addRecord', async () => {
    const result = await tool.execute({ action: 'addRecord' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('domainId');
  });

  it('should list domain records', async () => {
    const mockResult = { records: [{ id: 1, type: 'A', name: 'www', target: '1.2.3.4' }] };
    (service.listDomainRecords as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const result = await tool.execute({ action: 'listRecords', domainId: 1 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResult.records);
  });

  it('should update a domain record', async () => {
    const mockUpdated = { id: 42, type: 'A', name: 'www', target: '9.9.9.9' };
    (service.updateDomainRecord as ReturnType<typeof vi.fn>).mockResolvedValue(mockUpdated);

    const result = await tool.execute({
      action: 'updateRecord',
      domainId: 1,
      recordId: 42,
      target: '9.9.9.9',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockUpdated);
  });

  it('should validate domainId and recordId for updateRecord', async () => {
    const result = await tool.execute({ action: 'updateRecord' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('domainId');
  });

  it('should delete a domain record', async () => {
    (service.deleteDomainRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await tool.execute({
      action: 'deleteRecord',
      domainId: 1,
      recordId: 42,
    });

    expect(result.success).toBe(true);
    expect((result.data as any).deleted).toBe(true);
    expect(service.deleteDomainRecord).toHaveBeenCalledWith(1, 42);
  });

  it('should return error on service failure', async () => {
    (service.listDomains as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const result = await tool.execute({ action: 'listZones' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });
});
