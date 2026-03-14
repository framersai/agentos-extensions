import { describe, it, expect } from 'vitest';

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { ShellService } from '../src/services/shellService';
import { createExtensionPack } from '../src/index';

describe('@framers/agentos-ext-cli-executor filesystem policy', () => {
  it('allows reads only within configured readRoots', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-fs-roots-'));
    const allowedFile = path.join(root, 'allowed.txt');
    await fs.writeFile(allowedFile, 'ok', 'utf8');

    const service = new ShellService({
      workingDirectory: root,
      filesystem: { allowRead: true, readRoots: [root] },
    });

    const ok = await service.readFile('allowed.txt', { encoding: 'utf8' });
    expect(ok.content).toBe('ok');

    await expect(service.readFile(path.join(os.tmpdir(), 'not-allowed.txt'), { encoding: 'utf8' }))
      .rejects
      .toThrow(/outside allowed filesystem read roots/i);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('allows writes only within configured writeRoots', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-fs-roots-'));
    const service = new ShellService({
      workingDirectory: root,
      filesystem: { allowWrite: true, writeRoots: [root] },
    });

    const out = await service.writeFile('out.txt', 'hello', { createDirs: true });
    expect(out.path).toBe(path.join(root, 'out.txt'));

    await expect(service.writeFile(path.join(os.tmpdir(), 'not-allowed.txt'), 'nope'))
      .rejects
      .toThrow(/outside allowed filesystem write roots/i);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('blocks symlink escapes for reads', async () => {
    if (process.platform === 'win32') {
      // Symlink semantics differ and often require elevated privileges.
      return;
    }

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-fs-roots-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-fs-outside-'));
    const outsideFile = path.join(outside, 'secret.txt');
    await fs.writeFile(outsideFile, 'secret', 'utf8');

    const linkPath = path.join(root, 'link.txt');
    await fs.symlink(outsideFile, linkPath);

    const service = new ShellService({
      workingDirectory: root,
      filesystem: { allowRead: true, readRoots: [root] },
    });

    await expect(service.readFile('link.txt', { encoding: 'utf8' }))
      .rejects
      .toThrow(/outside allowed filesystem read roots/i);

    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  it('addReadRoot dynamically grants read access to a previously blocked path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-fs-roots-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-fs-outside-'));
    const outsideFile = path.join(outside, 'data.txt');
    await fs.writeFile(outsideFile, 'external data', 'utf8');

    const service = new ShellService({
      workingDirectory: root,
      filesystem: { allowRead: true, readRoots: [root] },
    });

    // Should fail before addReadRoot
    await expect(service.readFile(outsideFile, { encoding: 'utf8' }))
      .rejects
      .toThrow(/outside allowed filesystem read roots/i);

    // Dynamically grant access
    service.addReadRoot(outside);

    // Should succeed after addReadRoot
    const result = await service.readFile(outsideFile, { encoding: 'utf8' });
    expect(result.content).toBe('external data');

    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  it('addWriteRoot dynamically grants write access to a previously blocked path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-fs-roots-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-fs-outside-'));

    const service = new ShellService({
      workingDirectory: root,
      filesystem: { allowWrite: true, writeRoots: [root] },
    });

    const outsideFile = path.join(outside, 'output.txt');

    // Should fail before addWriteRoot
    await expect(service.writeFile(outsideFile, 'data'))
      .rejects
      .toThrow(/outside allowed filesystem write roots/i);

    // Dynamically grant access
    service.addWriteRoot(outside);

    // Should succeed after addWriteRoot
    const result = await service.writeFile(outsideFile, 'data');
    expect(result.path).toBe(outsideFile);
    const content = await fs.readFile(outsideFile, 'utf8');
    expect(content).toBe('data');

    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  it('addReadRoot deduplicates paths', () => {
    const service = new ShellService({
      filesystem: { allowRead: true, readRoots: ['/tmp'] },
    });

    service.addReadRoot('/tmp');
    service.addReadRoot('/tmp');

    // Access the config via any to check deduplication
    const roots = (service as any).config.filesystem.readRoots;
    expect(roots.filter((r: string) => r === path.resolve('/tmp')).length).toBe(1);
  });

  it('addReadRoot initializes filesystem config if undefined', () => {
    const service = new ShellService({});
    service.addReadRoot('/tmp');

    const config = (service as any).config;
    expect(config.filesystem).toBeDefined();
    expect(config.filesystem.allowRead).toBe(true);
    expect(config.filesystem.readRoots).toContain(path.resolve('/tmp'));
  });

  it('creates agent workspace directories on activate', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-agent-workspace-'));
    const pack = createExtensionPack({
      options: {
        filesystem: { allowRead: true, allowWrite: true },
        agentWorkspace: {
          agentId: 'agent-1',
          baseDir,
          createIfMissing: true,
          subdirs: ['assets'],
        },
      },
      logger: { info: () => undefined },
    } as any);

    await pack.onActivate?.({} as any);

    const workspaceDir = path.join(baseDir, 'agent-1');
    const stat = await fs.stat(workspaceDir);
    expect(stat.isDirectory()).toBe(true);

    const assets = await fs.stat(path.join(workspaceDir, 'assets'));
    expect(assets.isDirectory()).toBe(true);

    await fs.rm(baseDir, { recursive: true, force: true });
  });
});
