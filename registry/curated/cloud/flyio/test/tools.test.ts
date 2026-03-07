import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlyCreateVolumeTool } from '../src/tools/createVolume';
import { FlyDeployAppTool } from '../src/tools/deployApp';
import { FlyListAppsTool } from '../src/tools/listApps';
import { FlyScaleAppTool } from '../src/tools/scaleApp';

// ---------------------------------------------------------------------------
// FlyCreateVolumeTool
// ---------------------------------------------------------------------------

describe('FlyCreateVolumeTool', () => {
  let service: any;
  let tool: FlyCreateVolumeTool;

  beforeEach(() => {
    service = {
      createVolume: vi.fn(),
    };
    tool = new FlyCreateVolumeTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('flyCreateVolume');
    expect(tool.name).toBe('flyCreateVolume');
    expect(tool.displayName).toBe('Create Fly.io Volume');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual(
      expect.arrayContaining(['appName', 'name', 'region', 'sizeGb']),
    );
    expect(tool.category).toBe('cloud');
  });

  it('should create a volume successfully', async () => {
    service.createVolume.mockResolvedValue({
      id: 'vol_abc123',
      name: 'data',
      region: 'iad',
      sizeGb: 10,
      encrypted: true,
      state: 'created',
    });

    const result = await tool.execute({
      appName: 'my-app',
      name: 'data',
      region: 'iad',
      sizeGb: 10,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'vol_abc123');
    expect(result.data).toHaveProperty('sizeGb', 10);
    expect(service.createVolume).toHaveBeenCalledWith('my-app', {
      name: 'data',
      region: 'iad',
      sizeGb: 10,
      encrypted: undefined,
    });
  });

  it('should pass encrypted flag', async () => {
    service.createVolume.mockResolvedValue({ id: 'vol_1', encrypted: false });

    await tool.execute({
      appName: 'my-app',
      name: 'data',
      region: 'lax',
      sizeGb: 5,
      encrypted: false,
    });

    expect(service.createVolume).toHaveBeenCalledWith('my-app', expect.objectContaining({
      encrypted: false,
    }));
  });

  it('should handle errors gracefully', async () => {
    service.createVolume.mockRejectedValue(new Error('Insufficient capacity'));

    const result = await tool.execute({
      appName: 'my-app',
      name: 'data',
      region: 'iad',
      sizeGb: 500,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient capacity');
  });
});

// ---------------------------------------------------------------------------
// FlyDeployAppTool
// ---------------------------------------------------------------------------

describe('FlyDeployAppTool', () => {
  let service: any;
  let tool: FlyDeployAppTool;

  beforeEach(() => {
    service = {
      getApp: vi.fn(),
      createApp: vi.fn(),
      createMachine: vi.fn(),
    };
    tool = new FlyDeployAppTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('flyDeployApp');
    expect(tool.name).toBe('flyDeployApp');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('appName');
    expect(tool.inputSchema.required).toContain('image');
  });

  it('should deploy to an existing app', async () => {
    service.getApp.mockResolvedValue({
      name: 'my-app',
      status: 'deployed',
      organization: { slug: 'personal' },
    });
    service.createMachine.mockResolvedValue({
      id: 'machine-1',
      state: 'started',
      region: 'iad',
    });

    const result = await tool.execute({
      appName: 'my-app',
      image: 'nginx:alpine',
    });

    expect(result.success).toBe(true);
    expect(result.data?.app.name).toBe('my-app');
    expect(result.data?.machine.id).toBe('machine-1');
    expect(service.getApp).toHaveBeenCalledWith('my-app');
    expect(service.createApp).not.toHaveBeenCalled();
  });

  it('should create app if it does not exist', async () => {
    service.getApp.mockRejectedValue(new Error('Not found'));
    service.createApp.mockResolvedValue({ name: 'new-app', status: 'pending' });
    service.createMachine.mockResolvedValue({ id: 'machine-2', state: 'started' });

    const result = await tool.execute({
      appName: 'new-app',
      image: 'node:20-alpine',
      org: 'my-org',
    });

    expect(result.success).toBe(true);
    expect(service.createApp).toHaveBeenCalledWith('new-app', 'my-org');
  });

  it('should fail if app does not exist and createApp is false', async () => {
    service.getApp.mockRejectedValue(new Error('Not found'));

    const result = await tool.execute({
      appName: 'nonexistent',
      image: 'nginx:alpine',
      createApp: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should configure machine with custom resources', async () => {
    service.getApp.mockResolvedValue({ name: 'my-app' });
    service.createMachine.mockResolvedValue({ id: 'machine-3' });

    await tool.execute({
      appName: 'my-app',
      image: 'nginx:alpine',
      cpus: 2,
      cpuKind: 'performance',
      memoryMb: 512,
      internalPort: 3000,
      env: { NODE_ENV: 'production' },
      region: 'cdg',
    });

    expect(service.createMachine).toHaveBeenCalledWith(
      'my-app',
      expect.objectContaining({
        image: 'nginx:alpine',
        env: { NODE_ENV: 'production' },
        guest: expect.objectContaining({
          cpus: 2,
          cpu_kind: 'performance',
          memory_mb: 512,
        }),
      }),
      { region: 'cdg' },
    );
  });

  it('should handle errors gracefully', async () => {
    service.getApp.mockResolvedValue({ name: 'my-app' });
    service.createMachine.mockRejectedValue(new Error('Image not found'));

    const result = await tool.execute({
      appName: 'my-app',
      image: 'nonexistent:latest',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Image not found');
  });
});

// ---------------------------------------------------------------------------
// FlyListAppsTool
// ---------------------------------------------------------------------------

describe('FlyListAppsTool', () => {
  let service: any;
  let tool: FlyListAppsTool;

  beforeEach(() => {
    service = {
      listApps: vi.fn(),
      getApp: vi.fn(),
      listMachines: vi.fn(),
    };
    tool = new FlyListAppsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('flyListApps');
    expect(tool.name).toBe('flyListApps');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual([]);
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should list all apps with machines', async () => {
    service.listApps.mockResolvedValue([
      { name: 'app-1', status: 'deployed', machines: undefined },
      { name: 'app-2', status: 'deployed', machines: undefined },
    ]);
    service.listMachines.mockResolvedValue([
      { id: 'm-1', state: 'started', region: 'iad' },
    ]);

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(service.listMachines).toHaveBeenCalledTimes(2);
  });

  it('should get a single app by name', async () => {
    service.getApp.mockResolvedValue({ name: 'my-app', status: 'deployed' });
    service.listMachines.mockResolvedValue([{ id: 'm-1' }]);

    const result = await tool.execute({ appName: 'my-app' });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe('my-app');
    expect(service.getApp).toHaveBeenCalledWith('my-app');
  });

  it('should skip machines when includeMachines is false', async () => {
    service.listApps.mockResolvedValue([{ name: 'app-1' }]);

    const result = await tool.execute({ includeMachines: false });

    expect(result.success).toBe(true);
    expect(service.listMachines).not.toHaveBeenCalled();
  });

  it('should handle machine listing errors gracefully per-app', async () => {
    service.listApps.mockResolvedValue([
      { name: 'app-1', machines: undefined },
    ]);
    service.listMachines.mockRejectedValue(new Error('Forbidden'));

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data![0].machines).toEqual([]);
  });

  it('should handle errors gracefully', async () => {
    service.listApps.mockRejectedValue(new Error('Unauthorized'));

    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// FlyScaleAppTool
// ---------------------------------------------------------------------------

describe('FlyScaleAppTool', () => {
  let service: any;
  let tool: FlyScaleAppTool;

  beforeEach(() => {
    service = {
      listMachines: vi.fn(),
      createMachine: vi.fn(),
      destroyMachine: vi.fn(),
      updateMachine: vi.fn(),
    };
    tool = new FlyScaleAppTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('flyScaleApp');
    expect(tool.name).toBe('flyScaleApp');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('appName');
    expect(tool.inputSchema.required).toContain('count');
  });

  it('should scale up by creating new machines', async () => {
    service.listMachines
      .mockResolvedValueOnce([
        { id: 'm-1', config: { image: 'nginx', guest: { cpus: 1, cpu_kind: 'shared', memory_mb: 256 } } },
      ])
      .mockResolvedValueOnce([
        { id: 'm-1', config: {} },
        { id: 'm-2', config: {} },
        { id: 'm-3', config: {} },
      ]);
    service.createMachine.mockResolvedValue({ id: 'm-new' });

    const result = await tool.execute({ appName: 'my-app', count: 3 });

    expect(result.success).toBe(true);
    expect(result.data?.created).toBe(2);
    expect(result.data?.destroyed).toBe(0);
    expect(service.createMachine).toHaveBeenCalledTimes(2);
  });

  it('should scale down by destroying excess machines', async () => {
    service.listMachines
      .mockResolvedValueOnce([
        { id: 'm-1', config: {} },
        { id: 'm-2', config: {} },
        { id: 'm-3', config: {} },
      ])
      .mockResolvedValueOnce([{ id: 'm-1', config: {} }]);
    service.destroyMachine.mockResolvedValue(undefined);

    const result = await tool.execute({ appName: 'my-app', count: 1 });

    expect(result.success).toBe(true);
    expect(result.data?.destroyed).toBe(2);
    expect(service.destroyMachine).toHaveBeenCalledTimes(2);
  });

  it('should resize existing machines when resource params change', async () => {
    service.listMachines
      .mockResolvedValueOnce([
        { id: 'm-1', config: { guest: { cpus: 1, cpu_kind: 'shared', memory_mb: 256 } } },
      ])
      .mockResolvedValueOnce([{ id: 'm-1' }]);
    service.updateMachine.mockResolvedValue({});

    const result = await tool.execute({
      appName: 'my-app',
      count: 1,
      cpus: 2,
      memoryMb: 512,
    });

    expect(result.success).toBe(true);
    expect(result.data?.resized).toBe(1);
    expect(service.updateMachine).toHaveBeenCalledWith('my-app', 'm-1', {
      guest: expect.objectContaining({ cpus: 2, memory_mb: 512 }),
    });
  });

  it('should scale to zero by destroying all machines', async () => {
    service.listMachines
      .mockResolvedValueOnce([
        { id: 'm-1', config: {} },
        { id: 'm-2', config: {} },
      ])
      .mockResolvedValueOnce([]);
    service.destroyMachine.mockResolvedValue(undefined);

    const result = await tool.execute({ appName: 'my-app', count: 0 });

    expect(result.success).toBe(true);
    expect(result.data?.destroyed).toBe(2);
    expect(result.data?.machines).toEqual([]);
  });

  it('should handle errors gracefully', async () => {
    service.listMachines.mockRejectedValue(new Error('App not found'));

    const result = await tool.execute({ appName: 'nonexistent', count: 2 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('App not found');
  });
});
