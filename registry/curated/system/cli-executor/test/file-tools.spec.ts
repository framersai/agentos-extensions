// @ts-nocheck
/**
 * Tests for the file_read, file_write, and list_directory tools.
 *
 *   FileReadTool:
 *     - Basic read, line limit, byte limit, fromEnd (tail mode),
 *       encoding, binary redirect guard
 *
 *   FileWriteTool:
 *     - Create new file, append mode, createDirs,
 *       binary redirect guards (.xlsx, .docx, .pdf)
 *
 *   ListDirectoryTool:
 *     - Basic listing, recursive with maxDepth, pattern filtering,
 *       includeStats, showHidden
 *
 * Uses real tmp directories for actual filesystem operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { ShellService } from '../src/services/shellService';
import { FileReadTool } from '../src/tools/fileRead';
import { FileWriteTool } from '../src/tools/fileWrite';
import { ListDirectoryTool } from '../src/tools/listDir';

/** Minimal ToolExecutionContext stub — none of the tools under test use it. */
const ctx = {} as any;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FileReadTool
// ═══════════════════════════════════════════════════════════════════════════════

describe('FileReadTool', () => {
  let tmpDir: string;
  let service: ShellService;
  let tool: FileReadTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-fileread-'));
    service = new ShellService({ workingDirectory: tmpDir });
    tool = new FileReadTool(service);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── Basic read ──────────────────────────────────────────────────────────

  it('reads a file successfully', async () => {
    const filePath = path.join(tmpDir, 'hello.txt');
    await fs.writeFile(filePath, 'Hello, World!', 'utf8');

    const result = await tool.execute({ path: filePath }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.content).toBe('Hello, World!');
    expect(result.output!.path).toBe(filePath);
    expect(result.output!.size).toBeGreaterThan(0);
    expect(result.output!.encoding).toBe('utf-8');
  });

  it('returns error when file does not exist', async () => {
    const result = await tool.execute({ path: path.join(tmpDir, 'nonexistent.txt') }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ── Line limit ──────────────────────────────────────────────────────────

  it('reads only N lines from the start', async () => {
    const filePath = path.join(tmpDir, 'lines.txt');
    await fs.writeFile(filePath, 'line1\nline2\nline3\nline4\nline5', 'utf8');

    const result = await tool.execute({ path: filePath, lines: 3 }, ctx);
    expect(result.success).toBe(true);
    expect(result.output!.content).toBe('line1\nline2\nline3');
    expect(result.output!.truncated).toBe(true);
  });

  it('does not flag truncated when lines covers entire file', async () => {
    const filePath = path.join(tmpDir, 'short.txt');
    await fs.writeFile(filePath, 'one\ntwo', 'utf8');

    const result = await tool.execute({ path: filePath, lines: 10 }, ctx);
    expect(result.success).toBe(true);
    expect(result.output!.truncated).toBe(false);
  });

  // ── fromEnd (tail mode) ────────────────────────────────────────────────

  it('reads last N lines when fromEnd is true', async () => {
    const filePath = path.join(tmpDir, 'tail.txt');
    await fs.writeFile(filePath, 'a\nb\nc\nd\ne', 'utf8');

    const result = await tool.execute({ path: filePath, lines: 2, fromEnd: true }, ctx);
    expect(result.success).toBe(true);
    expect(result.output!.content).toBe('d\ne');
  });

  it('returns all lines when fromEnd lines exceeds file length', async () => {
    const filePath = path.join(tmpDir, 'short-tail.txt');
    await fs.writeFile(filePath, 'x\ny', 'utf8');

    const result = await tool.execute({ path: filePath, lines: 100, fromEnd: true }, ctx);
    expect(result.success).toBe(true);
    expect(result.output!.content).toBe('x\ny');
  });

  // ── Byte limit (maxBytes) ──────────────────────────────────────────────

  it('reads limited bytes with maxBytes', async () => {
    const filePath = path.join(tmpDir, 'bytes.txt');
    await fs.writeFile(filePath, 'abcdefghijklmnop', 'utf8');

    const result = await tool.execute({ path: filePath, maxBytes: 5 }, ctx);
    expect(result.success).toBe(true);
    expect(result.output!.content).toBe('abcde');
    expect(result.output!.truncated).toBe(true);
  });

  it('does not flag truncated when maxBytes >= file size', async () => {
    const filePath = path.join(tmpDir, 'small.txt');
    await fs.writeFile(filePath, 'hi', 'utf8');

    const result = await tool.execute({ path: filePath, maxBytes: 1024 }, ctx);
    expect(result.success).toBe(true);
    expect(result.output!.truncated).toBe(false);
  });

  // ── Encoding ──────────────────────────────────────────────────────────

  it('respects encoding parameter', async () => {
    const filePath = path.join(tmpDir, 'latin.txt');
    await fs.writeFile(filePath, Buffer.from('caf\u00e9', 'utf8'));

    const result = await tool.execute({ path: filePath, encoding: 'utf-8' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output!.content).toContain('caf');
    expect(result.output!.encoding).toBe('utf-8');
  });

  // ── Binary redirect guard ────────────────────────────────────────────

  it('rejects .xlsx read with redirect to read_document', async () => {
    const filePath = path.join(tmpDir, 'report.xlsx');
    await fs.writeFile(filePath, 'fake binary', 'utf8');

    const result = await tool.execute({ path: filePath }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('read_document');
  });

  it('rejects .xls read with redirect to read_document', async () => {
    const result = await tool.execute({ path: '/tmp/data.xls' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('read_document');
  });

  it('rejects .docx read with redirect to read_document', async () => {
    const result = await tool.execute({ path: '/tmp/document.docx' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('read_document');
  });

  it('rejects .pdf read with redirect to read_document', async () => {
    const result = await tool.execute({ path: '/tmp/report.pdf' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('read_document');
  });

  // ── Directory detection ──────────────────────────────────────────────

  it('returns error when trying to read a directory', async () => {
    const result = await tool.execute({ path: tmpDir }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/directory/i);
    expect(result.error).toContain('list_directory');
  });

  // ── validateArgs ──────────────────────────────────────────────────────

  it('validates that path is required', () => {
    const v = tool.validateArgs({});
    expect(v.isValid).toBe(false);
    expect(v.errors!.some((e: any) => /path/i.test(String(e)))).toBe(true);
  });

  it('validates that path must be a string', () => {
    const v = tool.validateArgs({ path: 42 });
    expect(v.isValid).toBe(false);
    expect(v.errors!.some((e: any) => /string/i.test(String(e)))).toBe(true);
  });

  it('accepts valid input', () => {
    const v = tool.validateArgs({ path: '/tmp/file.txt' });
    expect(v.isValid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. FileWriteTool
// ═══════════════════════════════════════════════════════════════════════════════

describe('FileWriteTool', () => {
  let tmpDir: string;
  let service: ShellService;
  let tool: FileWriteTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-filewrite-'));
    service = new ShellService({ workingDirectory: tmpDir });
    tool = new FileWriteTool(service);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── Create new file ───────────────────────────────────────────────────

  it('creates a new file', async () => {
    const filePath = path.join(tmpDir, 'new.txt');
    const result = await tool.execute(
      { path: filePath, content: 'brand new content' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.path).toBe(filePath);
    expect(result.output!.created).toBe(true);
    expect(result.output!.appended).toBe(false);
    expect(result.output!.bytesWritten).toBeGreaterThan(0);

    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe('brand new content');
  });

  it('overwrites an existing file by default', async () => {
    const filePath = path.join(tmpDir, 'overwrite.txt');
    await fs.writeFile(filePath, 'old content', 'utf8');

    const result = await tool.execute(
      { path: filePath, content: 'new content' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output!.created).toBe(false);

    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe('new content');
  });

  // ── Append mode ───────────────────────────────────────────────────────

  it('appends to an existing file when append is true', async () => {
    const filePath = path.join(tmpDir, 'append.txt');
    await fs.writeFile(filePath, 'first ', 'utf8');

    const result = await tool.execute(
      { path: filePath, content: 'second', append: true },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output!.appended).toBe(true);

    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe('first second');
  });

  it('creates file when appending to non-existent file', async () => {
    const filePath = path.join(tmpDir, 'append-new.txt');

    const result = await tool.execute(
      { path: filePath, content: 'appended', append: true },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output!.created).toBe(true);
    expect(result.output!.appended).toBe(true);

    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe('appended');
  });

  // ── createDirs ────────────────────────────────────────────────────────

  it('creates parent directories when createDirs is true', async () => {
    const filePath = path.join(tmpDir, 'nested', 'deep', 'file.txt');
    const result = await tool.execute(
      { path: filePath, content: 'deep file', createDirs: true },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output!.created).toBe(true);

    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe('deep file');
  });

  it('fails when createDirs is false and parent does not exist', async () => {
    const filePath = path.join(tmpDir, 'no-create', 'file.txt');
    const result = await tool.execute(
      { path: filePath, content: 'should fail', createDirs: false },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ── Binary redirect guards ───────────────────────────────────────────

  it('rejects .xlsx write with redirect to create_spreadsheet', async () => {
    const result = await tool.execute(
      { path: path.join(tmpDir, 'report.xlsx'), content: 'data' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('create_spreadsheet');
  });

  it('rejects .xls write with redirect to create_spreadsheet', async () => {
    const result = await tool.execute(
      { path: path.join(tmpDir, 'report.xls'), content: 'data' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('create_spreadsheet');
  });

  it('rejects .docx write with redirect to create_document', async () => {
    const result = await tool.execute(
      { path: path.join(tmpDir, 'doc.docx'), content: 'data' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('create_document');
  });

  it('rejects .pdf write with redirect to create_pdf', async () => {
    const result = await tool.execute(
      { path: path.join(tmpDir, 'doc.pdf'), content: 'data' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('create_pdf');
  });

  // ── Allowed text file writes ──────────────────────────────────────────

  it('allows .txt writes', async () => {
    const filePath = path.join(tmpDir, 'allowed.txt');
    const result = await tool.execute(
      { path: filePath, content: 'text file' },
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it('allows .json writes', async () => {
    const filePath = path.join(tmpDir, 'config.json');
    const result = await tool.execute(
      { path: filePath, content: '{"key": "value"}' },
      ctx,
    );
    expect(result.success).toBe(true);

    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe('{"key": "value"}');
  });

  it('allows .csv writes (text-based)', async () => {
    const filePath = path.join(tmpDir, 'data.csv');
    const result = await tool.execute(
      { path: filePath, content: 'a,b\n1,2' },
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it('allows .md writes', async () => {
    const filePath = path.join(tmpDir, 'readme.md');
    const result = await tool.execute(
      { path: filePath, content: '# Hello' },
      ctx,
    );
    expect(result.success).toBe(true);
  });

  // ── validateArgs ──────────────────────────────────────────────────────

  it('validates that path is required', () => {
    const v = tool.validateArgs({ content: 'ok' });
    expect(v.isValid).toBe(false);
    expect(v.errors!.some((e: any) => /path/i.test(String(e)))).toBe(true);
  });

  it('validates that content is required', () => {
    const v = tool.validateArgs({ path: '/tmp/file.txt' });
    expect(v.isValid).toBe(false);
    expect(v.errors!.some((e: any) => /content/i.test(String(e)))).toBe(true);
  });

  it('validates both path and content are required', () => {
    const v = tool.validateArgs({});
    expect(v.isValid).toBe(false);
    expect(v.errors).toHaveLength(2);
  });

  it('accepts valid input', () => {
    const v = tool.validateArgs({ path: '/tmp/file.txt', content: 'ok' });
    expect(v.isValid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ListDirectoryTool
// ═══════════════════════════════════════════════════════════════════════════════

describe('ListDirectoryTool', () => {
  let tmpDir: string;
  let service: ShellService;
  let tool: ListDirectoryTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-listdir-'));
    service = new ShellService({ workingDirectory: tmpDir });
    tool = new ListDirectoryTool(service);

    // Create a known directory structure:
    //   tmpDir/
    //     file-a.txt
    //     file-b.js
    //     .hidden-file
    //     sub/
    //       nested.txt
    //       deep/
    //         deep-file.ts
    await fs.writeFile(path.join(tmpDir, 'file-a.txt'), 'a', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'file-b.js'), 'b', 'utf8');
    await fs.writeFile(path.join(tmpDir, '.hidden-file'), 'hidden', 'utf8');
    await fs.mkdir(path.join(tmpDir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'sub', 'nested.txt'), 'nested', 'utf8');
    await fs.mkdir(path.join(tmpDir, 'sub', 'deep'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'sub', 'deep', 'deep-file.ts'), 'deep', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── Basic listing ─────────────────────────────────────────────────────

  it('lists top-level directory contents (non-recursive)', async () => {
    const result = await tool.execute({ path: tmpDir }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.path).toBe(tmpDir);
    expect(result.output!.recursive).toBe(false);

    const names = result.output!.entries.map((e: any) => e.name);
    expect(names).toContain('file-a.txt');
    expect(names).toContain('file-b.js');
    expect(names).toContain('sub');
    // Hidden files should be excluded by default
    expect(names).not.toContain('.hidden-file');
  });

  it('classifies files and directories correctly', async () => {
    const result = await tool.execute({ path: tmpDir }, ctx);
    const entries = result.output!.entries;

    const fileA = entries.find((e: any) => e.name === 'file-a.txt');
    expect(fileA).toBeDefined();
    expect(fileA.type).toBe('file');
    expect(fileA.extension).toBe('.txt');

    const sub = entries.find((e: any) => e.name === 'sub');
    expect(sub).toBeDefined();
    expect(sub.type).toBe('directory');
  });

  it('reports count matching the number of entries', async () => {
    const result = await tool.execute({ path: tmpDir }, ctx);
    expect(result.output!.count).toBe(result.output!.entries.length);
  });

  // ── showHidden ────────────────────────────────────────────────────────

  it('includes hidden files when showHidden is true', async () => {
    const result = await tool.execute({ path: tmpDir, showHidden: true }, ctx);
    const names = result.output!.entries.map((e: any) => e.name);
    expect(names).toContain('.hidden-file');
  });

  it('excludes hidden files when showHidden is false (default)', async () => {
    const result = await tool.execute({ path: tmpDir, showHidden: false }, ctx);
    const names = result.output!.entries.map((e: any) => e.name);
    expect(names).not.toContain('.hidden-file');
  });

  // ── Recursive listing ─────────────────────────────────────────────────

  it('recursively lists all files and directories', async () => {
    const result = await tool.execute({ path: tmpDir, recursive: true }, ctx);
    expect(result.success).toBe(true);
    expect(result.output!.recursive).toBe(true);

    const names = result.output!.entries.map((e: any) => e.name);
    expect(names).toContain('file-a.txt');
    expect(names).toContain('sub');
    expect(names).toContain('nested.txt');
    expect(names).toContain('deep');
    expect(names).toContain('deep-file.ts');
  });

  // ── maxDepth ──────────────────────────────────────────────────────────

  it('respects maxDepth to limit recursion', async () => {
    const result = await tool.execute(
      { path: tmpDir, recursive: true, maxDepth: 1 },
      ctx,
    );

    const names = result.output!.entries.map((e: any) => e.name);
    // Depth 0: file-a.txt, file-b.js, sub
    // Depth 1: sub/nested.txt, sub/deep
    expect(names).toContain('file-a.txt');
    expect(names).toContain('sub');
    expect(names).toContain('nested.txt');
    expect(names).toContain('deep');
    // Depth 2: sub/deep/deep-file.ts — should NOT be included
    expect(names).not.toContain('deep-file.ts');
  });

  // ── Pattern filtering ─────────────────────────────────────────────────

  it('filters entries by glob-like pattern', async () => {
    const result = await tool.execute({ path: tmpDir, pattern: '*.txt' }, ctx);
    const names = result.output!.entries.map((e: any) => e.name);
    expect(names).toContain('file-a.txt');
    expect(names).not.toContain('file-b.js');
    // sub directory does not match *.txt
    expect(names).not.toContain('sub');
  });

  it('filters with *.js pattern', async () => {
    const result = await tool.execute({ path: tmpDir, pattern: '*.js' }, ctx);
    const names = result.output!.entries.map((e: any) => e.name);
    expect(names).toContain('file-b.js');
    expect(names).not.toContain('file-a.txt');
  });

  it('applies pattern filtering recursively (pattern also applies to directories)', async () => {
    // The implementation applies the glob pattern to ALL entry names including
    // directories. If a directory name doesn't match the pattern, it is
    // skipped entirely and its children are never visited.
    const result = await tool.execute(
      { path: tmpDir, recursive: true, pattern: '*.txt' },
      ctx,
    );

    const names = result.output!.entries.map((e: any) => e.name);
    // Only top-level .txt files match because 'sub' doesn't match '*.txt',
    // so the directory is never entered.
    expect(names).toContain('file-a.txt');
    expect(names).not.toContain('file-b.js');
    expect(names).not.toContain('sub');
  });

  it('pattern with wildcard-prefix matches directories for deep traversal', async () => {
    // Use a broad pattern that matches directory names too, allowing recursion
    const result = await tool.execute(
      { path: tmpDir, recursive: true, pattern: '*' },
      ctx,
    );

    const names = result.output!.entries.map((e: any) => e.name);
    expect(names).toContain('file-a.txt');
    expect(names).toContain('sub');
    expect(names).toContain('nested.txt');
    expect(names).toContain('deep-file.ts');
  });

  // ── includeStats ──────────────────────────────────────────────────────

  it('includes file stats when includeStats is true', async () => {
    const result = await tool.execute(
      { path: tmpDir, includeStats: true },
      ctx,
    );

    const fileA = result.output!.entries.find((e: any) => e.name === 'file-a.txt');
    expect(fileA).toBeDefined();
    expect(fileA.size).toBeDefined();
    expect(typeof fileA.size).toBe('number');
    expect(fileA.modifiedAt).toBeDefined();
    expect(fileA.createdAt).toBeDefined();
  });

  it('omits file stats when includeStats is false (default)', async () => {
    const result = await tool.execute({ path: tmpDir }, ctx);

    const fileA = result.output!.entries.find((e: any) => e.name === 'file-a.txt');
    expect(fileA).toBeDefined();
    expect(fileA.size).toBeUndefined();
    expect(fileA.modifiedAt).toBeUndefined();
    expect(fileA.createdAt).toBeUndefined();
  });

  // ── Non-existent directory ────────────────────────────────────────────

  it('returns error for non-existent directory', async () => {
    const result = await tool.execute(
      { path: path.join(tmpDir, 'does-not-exist') },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ── Empty directory ───────────────────────────────────────────────────

  it('lists empty directory with zero entries', async () => {
    const emptyDir = path.join(tmpDir, 'empty');
    await fs.mkdir(emptyDir);

    const result = await tool.execute({ path: emptyDir }, ctx);
    expect(result.success).toBe(true);
    expect(result.output!.entries).toHaveLength(0);
    expect(result.output!.count).toBe(0);
  });

  // ── File extensions ───────────────────────────────────────────────────

  it('populates extension field for files', async () => {
    const result = await tool.execute({ path: tmpDir }, ctx);

    const fileA = result.output!.entries.find((e: any) => e.name === 'file-a.txt');
    expect(fileA.extension).toBe('.txt');

    const fileB = result.output!.entries.find((e: any) => e.name === 'file-b.js');
    expect(fileB.extension).toBe('.js');
  });

  it('does not set extension for directories', async () => {
    const result = await tool.execute({ path: tmpDir }, ctx);

    const sub = result.output!.entries.find((e: any) => e.name === 'sub');
    expect(sub.extension).toBeUndefined();
  });

  // ── Full path ─────────────────────────────────────────────────────────

  it('includes full absolute path for each entry', async () => {
    const result = await tool.execute({ path: tmpDir }, ctx);

    const fileA = result.output!.entries.find((e: any) => e.name === 'file-a.txt');
    expect(fileA.path).toBe(path.join(tmpDir, 'file-a.txt'));
  });

  // ── validateArgs ──────────────────────────────────────────────────────

  it('validates that path is required', () => {
    const v = tool.validateArgs({});
    expect(v.isValid).toBe(false);
    expect(v.errors!.some((e: any) => /path/i.test(String(e)))).toBe(true);
  });

  it('validates that path must be a string', () => {
    const v = tool.validateArgs({ path: 123 });
    expect(v.isValid).toBe(false);
    expect(v.errors!.some((e: any) => /string/i.test(String(e)))).toBe(true);
  });

  it('accepts valid input', () => {
    const v = tool.validateArgs({ path: '/tmp' });
    expect(v.isValid).toBe(true);
  });
});
