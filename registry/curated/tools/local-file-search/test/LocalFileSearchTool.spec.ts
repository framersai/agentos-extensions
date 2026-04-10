// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalFileSearchTool } from '../src/LocalFileSearchTool.js';

const TEST_DIR = join(tmpdir(), 'lfs-test-' + Date.now());

beforeAll(() => {
  mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'pics'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'node_modules', 'pkg'), { recursive: true });
  mkdirSync(join(TEST_DIR, '.ssh'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'docs', 'report.pdf'), 'fake pdf');
  writeFileSync(join(TEST_DIR, 'docs', 'notes.txt'), 'some notes');
  writeFileSync(join(TEST_DIR, 'pics', 'photo.png'), 'fake png');
  writeFileSync(join(TEST_DIR, 'pics', 'sunset.jpg'), 'fake jpg');
  writeFileSync(join(TEST_DIR, 'node_modules', 'pkg', 'index.js'), 'module');
  writeFileSync(join(TEST_DIR, '.ssh', 'id_rsa.key'), 'secret');
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('LocalFileSearchTool', () => {
  const tool = new LocalFileSearchTool({
    denylist: ['node_modules', '.ssh', '*.key'],
    maxResults: 10,
    maxDepth: 5,
    timeoutMs: 5000,
  });

  it('finds files by exact name', async () => {
    const result = await tool.execute({ query: 'report.pdf', directory: TEST_DIR });
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].name).toBe('report.pdf');
  });

  it('finds files by partial name', async () => {
    const result = await tool.execute({ query: 'photo', directory: TEST_DIR });
    expect(result.matches.some(m => m.name === 'photo.png')).toBe(true);
  });

  it('respects denylist — skips node_modules', async () => {
    const result = await tool.execute({ query: 'index.js', directory: TEST_DIR });
    expect(result.matches.length).toBe(0);
  });

  it('respects denylist — skips .ssh', async () => {
    const result = await tool.execute({ query: 'id_rsa', directory: TEST_DIR });
    expect(result.matches.length).toBe(0);
  });

  it('respects glob denylist — skips *.key files', async () => {
    const result = await tool.execute({ query: 'id_rsa.key', directory: TEST_DIR });
    expect(result.matches.length).toBe(0);
  });

  it('ranks exact matches higher than partial', async () => {
    const result = await tool.execute({ query: 'notes.txt', directory: TEST_DIR });
    expect(result.matches[0].name).toBe('notes.txt');
    expect(result.matches[0].relevance).toBeGreaterThan(0.8);
  });

  it('returns size and mimeType', async () => {
    const result = await tool.execute({ query: 'photo.png', directory: TEST_DIR });
    expect(result.matches[0].size).toBeGreaterThan(0);
    expect(result.matches[0].mimeType).toBe('image/png');
  });

  it('limits results to maxResults', async () => {
    const smallTool = new LocalFileSearchTool({
      denylist: ['node_modules', '.ssh', '*.key'],
      maxResults: 1,
      maxDepth: 5,
      timeoutMs: 5000,
    });
    const result = await smallTool.execute({ query: '.', directory: TEST_DIR });
    expect(result.matches.length).toBeLessThanOrEqual(1);
  });
});
