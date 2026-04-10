// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WidgetFileManager } from '../src/WidgetFileManager.js';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('WidgetFileManager', () => {
  let tempDir: string;
  let manager: WidgetFileManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'widget-test-'));
    manager = new WidgetFileManager(tempDir, 3777);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('save() creates widgets directory if not exists', async () => {
    const widgetsDir = join(tempDir, 'widgets');
    expect(existsSync(widgetsDir)).toBe(false);

    await manager.save('<div>test</div>', 'Test Widget');
    expect(existsSync(widgetsDir)).toBe(true);
  });

  it('save() writes file with correct content', async () => {
    const html = '<html><body>Hello world</body></html>';
    const { filePath } = await manager.save(html, 'My Widget');

    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe(html);
  });

  it('save() generates filename with timestamp and slug', async () => {
    const { filename } = await manager.save('<div>test</div>', 'My Cool Widget');

    // Filename pattern: ISO timestamp (with colons/dots replaced by hyphens) + slug + .html
    expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-my-cool-widget\.html$/);
  });

  it('list() returns saved widgets with metadata', async () => {
    const html = '<div>list test</div>';
    await manager.save(html, 'List Test');

    const entries = await manager.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveProperty('filename');
    expect(entries[0]).toHaveProperty('sizeBytes');
    expect(entries[0].sizeBytes).toBeGreaterThan(0);
    expect(entries[0]).toHaveProperty('createdAt');
  });

  it('list() returns empty array when no widgets', async () => {
    const entries = await manager.list();
    expect(entries).toEqual([]);
  });

  it('remove() deletes widget file and returns true', async () => {
    const { filename, filePath } = await manager.save('<div>remove me</div>', 'Remove Me');

    expect(existsSync(filePath)).toBe(true);
    const removed = await manager.remove(filename);
    expect(removed).toBe(true);
    expect(existsSync(filePath)).toBe(false);
  });

  it('remove() returns false for non-existent file', async () => {
    const removed = await manager.remove('does-not-exist.html');
    expect(removed).toBe(false);
  });

  it('resolve() returns full path for existing file', async () => {
    const { filename, filePath } = await manager.save('<div>resolve me</div>', 'Resolve Test');

    const resolved = manager.resolve(filename);
    expect(resolved).toBe(filePath);
  });

  it('resolve() returns null for non-existent file', () => {
    const resolved = manager.resolve('nope.html');
    expect(resolved).toBeNull();
  });

  it('rejects traversal attempts for resolve() and remove()', async () => {
    expect(manager.resolve('../secret.html')).toBeNull();
    await expect(manager.remove('../secret.html')).resolves.toBe(false);
  });

  it('getWidgetUrl() returns correct URL format', async () => {
    const url = manager.getWidgetUrl('my-widget.html');
    expect(url).toBe('http://localhost:3777/widgets/my-widget.html');
  });

  it('uses the configured public base URL for generated widget links', () => {
    const remoteManager = new WidgetFileManager(tempDir, 3777, 'https://agent.example.com/base/');
    expect(remoteManager.getWidgetUrl('my-widget.html')).toBe(
      'https://agent.example.com/base/widgets/my-widget.html',
    );
  });

  it('slugify handles special characters, spaces, and uppercase', async () => {
    const { filename } = await manager.save('<div>test</div>', '3D Solar System!');
    // The slug portion should be "3d-solar-system"
    expect(filename).toContain('3d-solar-system');
    // Extract the slug part (after the ISO timestamp prefix) and verify it has no uppercase or special chars
    const slug = filename.replace(/^\d{4}-\d{2}-\d{2}T[\d-]+Z-/, '');
    expect(slug).not.toMatch(/[A-Z!]/);
  });
});
