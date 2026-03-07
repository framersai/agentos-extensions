import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RailwayAddDatabaseTool } from '../src/tools/addDatabase';
import { RailwayDeployServiceTool } from '../src/tools/deployService';
import { RailwayGetLogsTool } from '../src/tools/getLogs';
import { RailwayListServicesTool } from '../src/tools/listServices';

// ---------------------------------------------------------------------------
// RailwayAddDatabaseTool
// ---------------------------------------------------------------------------

describe('RailwayAddDatabaseTool', () => {
  let service: any;
  let tool: RailwayAddDatabaseTool;

  beforeEach(() => {
    service = {
      createPlugin: vi.fn(),
    };
    tool = new RailwayAddDatabaseTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('railwayAddDatabase');
    expect(tool.name).toBe('railwayAddDatabase');
    expect(tool.displayName).toBe('Add Railway Database');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('projectId');
    expect(tool.inputSchema.required).toContain('plugin');
    expect(tool.category).toBe('cloud');
  });

  it('should provision a PostgreSQL database', async () => {
    service.createPlugin.mockResolvedValue({
      id: 'plugin-1',
      name: 'PostgreSQL',
      status: 'running',
      connectionUrl: 'postgres://user:pass@host:5432/db',
    });

    const result = await tool.execute({
      projectId: 'proj-abc',
      plugin: 'postgresql',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'plugin-1');
    expect(service.createPlugin).toHaveBeenCalledWith('proj-abc', 'postgresql');
  });

  it('should provision a Redis database', async () => {
    service.createPlugin.mockResolvedValue({
      id: 'plugin-2',
      name: 'Redis',
      status: 'running',
    });

    const result = await tool.execute({
      projectId: 'proj-abc',
      plugin: 'redis',
    });

    expect(result.success).toBe(true);
    expect(service.createPlugin).toHaveBeenCalledWith('proj-abc', 'redis');
  });

  it('should handle errors gracefully', async () => {
    service.createPlugin.mockRejectedValue(new Error('Project not found'));

    const result = await tool.execute({
      projectId: 'nonexistent',
      plugin: 'postgresql',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Project not found');
  });
});

// ---------------------------------------------------------------------------
// RailwayDeployServiceTool
// ---------------------------------------------------------------------------

describe('RailwayDeployServiceTool', () => {
  let service: any;
  let tool: RailwayDeployServiceTool;

  beforeEach(() => {
    service = {
      createProject: vi.fn(),
      createService: vi.fn(),
      redeployService: vi.fn(),
      upsertVariables: vi.fn(),
    };
    tool = new RailwayDeployServiceTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('railwayDeployService');
    expect(tool.name).toBe('railwayDeployService');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual([]);
  });

  it('should create a new service in an existing project', async () => {
    service.createService.mockResolvedValue({
      id: 'svc-1',
      name: 'api',
      projectId: 'proj-123',
    });

    const result = await tool.execute({
      projectId: 'proj-123',
      repo: 'user/repo',
      serviceName: 'api',
    });

    expect(result.success).toBe(true);
    expect(result.data?.service).toHaveProperty('id', 'svc-1');
    expect(result.data?.projectId).toBe('proj-123');
    expect(service.createService).toHaveBeenCalledWith('proj-123', {
      name: 'api',
      source: { repo: 'user/repo' },
      variables: undefined,
    });
  });

  it('should create a new project when projectId is omitted', async () => {
    service.createProject.mockResolvedValue({ id: 'proj-new' });
    service.createService.mockResolvedValue({ id: 'svc-2', name: 'app' });

    const result = await tool.execute({
      projectName: 'my-project',
      repo: 'user/repo',
    });

    expect(result.success).toBe(true);
    expect(result.data?.projectId).toBe('proj-new');
    expect(service.createProject).toHaveBeenCalledWith('my-project');
  });

  it('should redeploy an existing service', async () => {
    service.redeployService.mockResolvedValue({
      id: 'deploy-1',
      status: 'BUILDING',
    });

    const result = await tool.execute({
      serviceId: 'svc-1',
      environmentId: 'env-prod',
    });

    expect(result.success).toBe(true);
    expect(result.data?.deployment).toHaveProperty('id', 'deploy-1');
    expect(service.redeployService).toHaveBeenCalledWith('svc-1', 'env-prod');
  });

  it('should set variables before redeploying', async () => {
    service.upsertVariables.mockResolvedValue({});
    service.redeployService.mockResolvedValue({ id: 'deploy-2' });

    await tool.execute({
      serviceId: 'svc-1',
      environmentId: 'env-prod',
      variables: { DATABASE_URL: 'postgres://localhost/db' },
    });

    expect(service.upsertVariables).toHaveBeenCalledWith('svc-1', 'env-prod', {
      DATABASE_URL: 'postgres://localhost/db',
    });
    expect(service.redeployService).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    service.createService.mockRejectedValue(new Error('Rate limit exceeded'));

    const result = await tool.execute({
      projectId: 'proj-1',
      repo: 'user/repo',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limit exceeded');
  });
});

// ---------------------------------------------------------------------------
// RailwayGetLogsTool
// ---------------------------------------------------------------------------

describe('RailwayGetLogsTool', () => {
  let service: any;
  let tool: RailwayGetLogsTool;

  beforeEach(() => {
    service = {
      getDeploymentLogs: vi.fn(),
      getBuildLogs: vi.fn(),
    };
    tool = new RailwayGetLogsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('railwayGetLogs');
    expect(tool.name).toBe('railwayGetLogs');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('deploymentId');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should retrieve deployment logs by default', async () => {
    service.getDeploymentLogs.mockResolvedValue([
      { timestamp: '2024-01-01T00:00:00Z', message: 'Listening on port 3000', severity: 'INFO' },
    ]);

    const result = await tool.execute({ deploymentId: 'deploy-1' });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(service.getDeploymentLogs).toHaveBeenCalledWith('deploy-1');
    expect(service.getBuildLogs).not.toHaveBeenCalled();
  });

  it('should retrieve build logs when type is build', async () => {
    service.getBuildLogs.mockResolvedValue([
      { timestamp: '2024-01-01T00:00:00Z', message: 'Installing dependencies...', severity: 'INFO' },
    ]);

    const result = await tool.execute({
      deploymentId: 'deploy-1',
      type: 'build',
    });

    expect(result.success).toBe(true);
    expect(service.getBuildLogs).toHaveBeenCalledWith('deploy-1');
    expect(service.getDeploymentLogs).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    service.getDeploymentLogs.mockRejectedValue(new Error('Deployment not found'));

    const result = await tool.execute({ deploymentId: 'nonexistent' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Deployment not found');
  });
});

// ---------------------------------------------------------------------------
// RailwayListServicesTool
// ---------------------------------------------------------------------------

describe('RailwayListServicesTool', () => {
  let service: any;
  let tool: RailwayListServicesTool;

  beforeEach(() => {
    service = {
      listProjects: vi.fn(),
      getProject: vi.fn(),
    };
    tool = new RailwayListServicesTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('railwayListServices');
    expect(tool.name).toBe('railwayListServices');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual([]);
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should list all projects when no projectId is provided', async () => {
    service.listProjects.mockResolvedValue([
      { id: 'proj-1', name: 'Project 1', services: [] },
      { id: 'proj-2', name: 'Project 2', services: [] },
    ]);

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(service.listProjects).toHaveBeenCalled();
    expect(service.getProject).not.toHaveBeenCalled();
  });

  it('should fetch a single project by ID', async () => {
    service.getProject.mockResolvedValue({
      id: 'proj-1',
      name: 'Project 1',
      services: [{ id: 'svc-1', name: 'api' }],
    });

    const result = await tool.execute({ projectId: 'proj-1' });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].id).toBe('proj-1');
    expect(service.getProject).toHaveBeenCalledWith('proj-1');
  });

  it('should handle errors gracefully', async () => {
    service.listProjects.mockRejectedValue(new Error('Unauthorized'));

    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unauthorized');
  });
});
