import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HerokuAddAddonTool } from '../src/tools/addAddon';
import { HerokuCreateAppTool } from '../src/tools/createApp';
import { HerokuDeployAppTool } from '../src/tools/deployApp';
import { HerokuGetLogsTool } from '../src/tools/getLogs';
import { HerokuScaleDynosTool } from '../src/tools/scaleDynos';

// ---------------------------------------------------------------------------
// HerokuCreateAppTool
// ---------------------------------------------------------------------------

describe('HerokuCreateAppTool', () => {
  let service: any;
  let tool: HerokuCreateAppTool;

  beforeEach(() => {
    service = {
      createApp: vi.fn(),
      updateConfigVars: vi.fn(),
    };
    tool = new HerokuCreateAppTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('herokuCreateApp');
    expect(tool.name).toBe('herokuCreateApp');
    expect(tool.displayName).toBe('Create Heroku App');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual([]);
    expect(tool.category).toBe('cloud');
  });

  it('should create an app with no arguments', async () => {
    service.createApp.mockResolvedValue({
      name: 'random-app-12345',
      region: 'us',
      webUrl: 'https://random-app-12345.herokuapp.com',
    });

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('name', 'random-app-12345');
    expect(service.createApp).toHaveBeenCalledWith({
      name: undefined,
      region: undefined,
      stack: undefined,
    });
  });

  it('should create an app with name and region', async () => {
    service.createApp.mockResolvedValue({
      name: 'my-app',
      region: 'eu',
      webUrl: 'https://my-app.herokuapp.com',
    });

    const result = await tool.execute({
      name: 'my-app',
      region: 'eu',
    });

    expect(result.success).toBe(true);
    expect(service.createApp).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-app', region: 'eu' }),
    );
  });

  it('should set config vars after creation', async () => {
    service.createApp.mockResolvedValue({
      name: 'my-app',
      region: 'us',
    });
    service.updateConfigVars.mockResolvedValue({});

    const result = await tool.execute({
      name: 'my-app',
      configVars: { NODE_ENV: 'production', API_KEY: 'secret123' },
    });

    expect(result.success).toBe(true);
    expect(service.updateConfigVars).toHaveBeenCalledWith('my-app', {
      NODE_ENV: 'production',
      API_KEY: 'secret123',
    });
  });

  it('should not call updateConfigVars when configVars is empty', async () => {
    service.createApp.mockResolvedValue({ name: 'my-app' });

    await tool.execute({ name: 'my-app', configVars: {} });

    expect(service.updateConfigVars).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    service.createApp.mockRejectedValue(new Error('Name is already taken'));

    const result = await tool.execute({ name: 'taken-app' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Name is already taken');
  });
});

// ---------------------------------------------------------------------------
// HerokuDeployAppTool
// ---------------------------------------------------------------------------

describe('HerokuDeployAppTool', () => {
  let service: any;
  let tool: HerokuDeployAppTool;

  beforeEach(() => {
    service = {
      createBuild: vi.fn(),
      updateConfigVars: vi.fn(),
    };
    tool = new HerokuDeployAppTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('herokuDeployApp');
    expect(tool.name).toBe('herokuDeployApp');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('appName');
    expect(tool.inputSchema.required).toContain('sourceUrl');
  });

  it('should deploy an app from a source URL', async () => {
    service.createBuild.mockResolvedValue({
      id: 'build-123',
      status: 'pending',
      outputStreamUrl: 'https://build-output.heroku.com/streams/abc',
    });

    const result = await tool.execute({
      appName: 'my-app',
      sourceUrl: 'https://github.com/user/repo/archive/main.tar.gz',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'build-123');
    expect(service.createBuild).toHaveBeenCalledWith(
      'my-app',
      'https://github.com/user/repo/archive/main.tar.gz',
      undefined,
    );
  });

  it('should set config vars before deploying', async () => {
    service.updateConfigVars.mockResolvedValue({});
    service.createBuild.mockResolvedValue({ id: 'build-1', status: 'pending' });

    await tool.execute({
      appName: 'my-app',
      sourceUrl: 'https://example.com/source.tar.gz',
      configVars: { DATABASE_URL: 'postgres://localhost/db' },
    });

    expect(service.updateConfigVars).toHaveBeenCalledWith('my-app', {
      DATABASE_URL: 'postgres://localhost/db',
    });
    expect(service.createBuild).toHaveBeenCalled();
  });

  it('should pass version to createBuild', async () => {
    service.createBuild.mockResolvedValue({ id: 'build-1' });

    await tool.execute({
      appName: 'my-app',
      sourceUrl: 'https://example.com/source.tar.gz',
      version: 'v1.2.3',
    });

    expect(service.createBuild).toHaveBeenCalledWith('my-app', expect.any(String), 'v1.2.3');
  });

  it('should handle errors gracefully', async () => {
    service.createBuild.mockRejectedValue(new Error('App not found'));

    const result = await tool.execute({
      appName: 'nonexistent-app',
      sourceUrl: 'https://example.com/source.tar.gz',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('App not found');
  });
});

// ---------------------------------------------------------------------------
// HerokuAddAddonTool
// ---------------------------------------------------------------------------

describe('HerokuAddAddonTool', () => {
  let service: any;
  let tool: HerokuAddAddonTool;

  beforeEach(() => {
    service = {
      addAddon: vi.fn(),
    };
    tool = new HerokuAddAddonTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('herokuAddAddon');
    expect(tool.name).toBe('herokuAddAddon');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('appName');
    expect(tool.inputSchema.required).toContain('plan');
  });

  it('should provision an addon successfully', async () => {
    service.addAddon.mockResolvedValue({
      id: 'addon-123',
      name: 'postgresql-rugged-42',
      plan: { name: 'heroku-postgresql:essential-0' },
      state: 'provisioning',
    });

    const result = await tool.execute({
      appName: 'my-app',
      plan: 'heroku-postgresql:essential-0',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'addon-123');
    expect(service.addAddon).toHaveBeenCalledWith('my-app', 'heroku-postgresql:essential-0', {
      name: undefined,
      config: undefined,
    });
  });

  it('should pass custom addon name and config', async () => {
    service.addAddon.mockResolvedValue({ id: 'addon-1' });

    await tool.execute({
      appName: 'my-app',
      plan: 'heroku-redis:mini',
      addonName: 'my-redis',
      config: { maxmemory_policy: 'allkeys-lru' },
    });

    expect(service.addAddon).toHaveBeenCalledWith('my-app', 'heroku-redis:mini', {
      name: 'my-redis',
      config: { maxmemory_policy: 'allkeys-lru' },
    });
  });

  it('should handle errors gracefully', async () => {
    service.addAddon.mockRejectedValue(new Error('Plan not found'));

    const result = await tool.execute({
      appName: 'my-app',
      plan: 'nonexistent-addon:free',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Plan not found');
  });
});

// ---------------------------------------------------------------------------
// HerokuGetLogsTool
// ---------------------------------------------------------------------------

describe('HerokuGetLogsTool', () => {
  let service: any;
  let tool: HerokuGetLogsTool;

  beforeEach(() => {
    service = {
      createLogSession: vi.fn(),
      fetchLogs: vi.fn(),
    };
    tool = new HerokuGetLogsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('herokuGetLogs');
    expect(tool.name).toBe('herokuGetLogs');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('appName');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should retrieve logs successfully', async () => {
    service.createLogSession.mockResolvedValue({
      logplexUrl: 'https://logplex.heroku.com/sessions/abc',
    });
    service.fetchLogs.mockResolvedValue('2024-01-01T00:00:00Z app[web.1]: Server started');

    const result = await tool.execute({ appName: 'my-app' });

    expect(result.success).toBe(true);
    expect(result.data?.logs).toContain('Server started');
    expect(result.data?.logplexUrl).toBe('https://logplex.heroku.com/sessions/abc');
    expect(service.createLogSession).toHaveBeenCalledWith('my-app', {
      lines: 100,
      dyno: undefined,
      source: undefined,
      tail: false,
    });
  });

  it('should pass custom lines, dyno, and source filters', async () => {
    service.createLogSession.mockResolvedValue({ logplexUrl: 'https://logplex.heroku.com/sessions/xyz' });
    service.fetchLogs.mockResolvedValue('logs here');

    await tool.execute({
      appName: 'my-app',
      lines: 500,
      dyno: 'web.1',
      source: 'app',
    });

    expect(service.createLogSession).toHaveBeenCalledWith('my-app', {
      lines: 500,
      dyno: 'web.1',
      source: 'app',
      tail: false,
    });
  });

  it('should handle errors gracefully', async () => {
    service.createLogSession.mockRejectedValue(new Error('App not found'));

    const result = await tool.execute({ appName: 'nonexistent' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('App not found');
  });
});

// ---------------------------------------------------------------------------
// HerokuScaleDynosTool
// ---------------------------------------------------------------------------

describe('HerokuScaleDynosTool', () => {
  let service: any;
  let tool: HerokuScaleDynosTool;

  beforeEach(() => {
    service = {
      scaleDynos: vi.fn(),
    };
    tool = new HerokuScaleDynosTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('herokuScaleDynos');
    expect(tool.name).toBe('herokuScaleDynos');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('appName');
    expect(tool.inputSchema.required).toContain('type');
    expect(tool.inputSchema.required).toContain('quantity');
  });

  it('should scale dynos successfully', async () => {
    service.scaleDynos.mockResolvedValue({
      type: 'web',
      quantity: 3,
      size: 'standard-1x',
    });

    const result = await tool.execute({
      appName: 'my-app',
      type: 'web',
      quantity: 3,
      size: 'standard-1x',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('quantity', 3);
    expect(service.scaleDynos).toHaveBeenCalledWith('my-app', 'web', 3, 'standard-1x');
  });

  it('should scale down to zero', async () => {
    service.scaleDynos.mockResolvedValue({ type: 'worker', quantity: 0 });

    const result = await tool.execute({
      appName: 'my-app',
      type: 'worker',
      quantity: 0,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('quantity', 0);
  });

  it('should handle errors gracefully', async () => {
    service.scaleDynos.mockRejectedValue(new Error('Cannot scale eco dynos'));

    const result = await tool.execute({
      appName: 'my-app',
      type: 'web',
      quantity: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot scale eco dynos');
  });
});
