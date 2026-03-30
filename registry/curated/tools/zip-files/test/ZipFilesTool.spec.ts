import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ZipFilesTool } from '../src/ZipFilesTool.js';

const TEST_DIR = join(tmpdir(), 'zip-test-' + Date.now());

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(join(TEST_DIR, 'file1.txt'), 'Hello World');
  writeFileSync(join(TEST_DIR, 'file2.txt'), 'Second file content');
  writeFileSync(join(TEST_DIR, 'image.png'), Buffer.alloc(1024, 0xff));
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('ZipFilesTool', () => {
  const tool = new ZipFilesTool();

  it('creates a zip from multiple files', async () => {
    const result = await tool.execute({
      files: [join(TEST_DIR, 'file1.txt'), join(TEST_DIR, 'file2.txt')],
      outputName: 'test-archive',
    });
    expect(result.name).toBe('test-archive.zip');
    expect(result.fileCount).toBe(2);
    expect(result.size).toBeGreaterThan(0);
    expect(existsSync(result.path)).toBe(true);
  });

  it('auto-generates name when outputName not provided', async () => {
    const result = await tool.execute({ files: [join(TEST_DIR, 'file1.txt')] });
    expect(result.name).toMatch(/^wunderland-\d+\.zip$/);
  });

  it('throws on non-existent file', async () => {
    await expect(tool.execute({ files: ['/nonexistent/file.txt'] }))
      .rejects.toThrow('File not found');
  });

  it('includes binary files', async () => {
    const result = await tool.execute({
      files: [join(TEST_DIR, 'image.png')],
      outputName: 'binary-test',
    });
    expect(result.size).toBeGreaterThan(0);
    expect(result.fileCount).toBe(1);
  });
});
