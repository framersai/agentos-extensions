/**
 * Tests for document creation / reading tools:
 *   - CreateSpreadsheetTool  (xlsx, csv)
 *   - CreateDocumentTool     (docx)
 *   - FileWriteTool          (redirect guards for binary formats)
 *   - createExtensionPack    (descriptor registration)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { CreateSpreadsheetTool } from '../src/tools/createSpreadsheet.js';
import { CreateDocumentTool } from '../src/tools/createDocument.js';
import { FileWriteTool } from '../src/tools/fileWrite.js';
import { createExtensionPack } from '../src/index.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Minimal ToolExecutionContext stub — none of the tools under test use it. */
const ctx = {} as any;

let tmpDir: string;

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `cli-executor-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. CreateSpreadsheetTool
// ═══════════════════════════════════════════════════════════════════════════

describe('CreateSpreadsheetTool', () => {
  const tool = new CreateSpreadsheetTool();

  // ── XLSX from headers + rows ───────────────────────────────────────────

  it('creates xlsx from headers + rows', async () => {
    const outPath = path.join(tmpDir, 'from-rows.xlsx');
    const result = await tool.execute(
      {
        path: outPath,
        headers: ['Name', 'Age'],
        rows: [
          ['Alice', 30],
          ['Bob', 25],
        ],
      },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.format).toBe('xlsx');
    expect(result.output!.rows).toBe(2);
    expect(result.output!.bytes).toBeGreaterThan(0);

    // Verify the file exists and is a valid xlsx
    const XLSX = await import('xlsx');
    const buf = await fs.readFile(outPath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
    expect(data).toHaveLength(2);
    expect(data[0]['Name']).toBe('Alice');
    expect(data[1]['Age']).toBe(25);
  });

  // ── XLSX from array of objects ─────────────────────────────────────────

  it('creates xlsx from array of objects (data param)', async () => {
    const outPath = path.join(tmpDir, 'from-objects.xlsx');
    const result = await tool.execute(
      {
        path: outPath,
        data: [
          { product: 'Widget', price: 9.99, qty: 100 },
          { product: 'Gadget', price: 19.99, qty: 50 },
        ],
      },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output!.rows).toBe(2);

    const XLSX = await import('xlsx');
    const buf = await fs.readFile(outPath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
    expect(data[0]['product']).toBe('Widget');
    expect(data[1]['price']).toBe(19.99);
  });

  // ── XLSX from markdown table ───────────────────────────────────────────

  it('creates xlsx from markdown table string', async () => {
    const outPath = path.join(tmpDir, 'from-md.xlsx');
    const md = [
      '| City      | Pop   |',
      '| --------- | ----- |',
      '| New York  | 8336  |',
      '| London    | 8982  |',
    ].join('\n');

    const result = await tool.execute({ path: outPath, markdown: md }, ctx);

    expect(result.success).toBe(true);
    expect(result.output!.rows).toBe(2);

    const XLSX = await import('xlsx');
    const buf = await fs.readFile(outPath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
    expect(data[0]['City']).toBe('New York');
  });

  // ── CSV from headers + rows (auto-detected) ───────────────────────────

  it('creates CSV from headers + rows (auto-detected from .csv extension)', async () => {
    const outPath = path.join(tmpDir, 'output.csv');
    const result = await tool.execute(
      {
        path: outPath,
        headers: ['X', 'Y'],
        rows: [
          [1, 2],
          [3, 4],
        ],
      },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output!.format).toBe('csv');

    const content = await fs.readFile(outPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines[0]).toBe('X,Y');
    expect(lines[1]).toBe('1,2');
    expect(lines[2]).toBe('3,4');
  });

  // ── CSV escaping ───────────────────────────────────────────────────────

  it('escapes commas, quotes, and newlines in CSV values', async () => {
    const outPath = path.join(tmpDir, 'escaped.csv');
    const result = await tool.execute(
      {
        path: outPath,
        headers: ['Label', 'Value'],
        rows: [
          ['has, comma', 'plain'],
          ['has "quotes"', 'also\nnewline'],
        ],
      },
      ctx,
    );

    expect(result.success).toBe(true);
    const content = await fs.readFile(outPath, 'utf-8');
    // The comma-containing value should be double-quoted
    expect(content).toContain('"has, comma"');
    // Embedded quotes should be escaped as ""
    expect(content).toContain('"has ""quotes"""');
    // Newline-containing value should be wrapped
    expect(content).toContain('"also\nnewline"');
  });

  // ── Validation: no data source ─────────────────────────────────────────

  it('returns error when no data source is provided', async () => {
    const result = await tool.execute({ path: path.join(tmpDir, 'empty.xlsx') }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Provide data in one of three forms/i);
  });

  // ── Validation: path required ──────────────────────────────────────────

  it('validates that path is required', () => {
    const v = tool.validateArgs({ headers: ['a'], rows: [['b']] });
    expect(v.isValid).toBe(false);
    expect(v.errors).toBeDefined();
    expect(v.errors!.some((e: any) => /path/i.test(String(e)))).toBe(true);
  });

  // ── Auto-detect format from extension ──────────────────────────────────

  it('auto-detects format from file extension', async () => {
    const xlsxPath = path.join(tmpDir, 'auto.xlsx');
    const csvPath = path.join(tmpDir, 'auto.csv');
    const headers = ['A'];
    const rows = [['1']];

    const r1 = await tool.execute({ path: xlsxPath, headers, rows }, ctx);
    expect(r1.output!.format).toBe('xlsx');

    const r2 = await tool.execute({ path: csvPath, headers, rows }, ctx);
    expect(r2.output!.format).toBe('csv');
  });

  // ── Explicit format override ───────────────────────────────────────────

  it('respects explicit format override (format: csv with .xlsx extension)', async () => {
    const outPath = path.join(tmpDir, 'override.xlsx');
    const result = await tool.execute(
      {
        path: outPath,
        headers: ['Col'],
        rows: [['val']],
        format: 'csv',
      },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output!.format).toBe('csv');

    // File content should be CSV text, not binary xlsx
    const content = await fs.readFile(outPath, 'utf-8');
    expect(content).toContain('Col');
    expect(content).toContain('val');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CreateDocumentTool
// ═══════════════════════════════════════════════════════════════════════════

describe('CreateDocumentTool', () => {
  const tool = new CreateDocumentTool();

  /** Helper: extract raw text from a .docx buffer via mammoth. */
  async function extractText(filePath: string): Promise<string> {
    const mammoth = await import('mammoth');
    const buf = await fs.readFile(filePath);
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }

  // ── Plain text ─────────────────────────────────────────────────────────

  it('creates docx with plain text', async () => {
    const outPath = path.join(tmpDir, 'plain.docx');
    const result = await tool.execute(
      { path: outPath, content: 'Hello, World!' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output!.paragraphs).toBeGreaterThanOrEqual(1);
    expect(result.output!.bytes).toBeGreaterThan(0);

    const text = await extractText(outPath);
    expect(text).toContain('Hello, World!');
  });

  // ── Markdown headings ─────────────────────────────────────────────────

  it('creates docx with markdown headings (# H1 through ###### H6)', async () => {
    const outPath = path.join(tmpDir, 'headings.docx');
    const md = [
      '# Heading 1',
      '## Heading 2',
      '### Heading 3',
      '#### Heading 4',
      '##### Heading 5',
      '###### Heading 6',
    ].join('\n');

    const result = await tool.execute({ path: outPath, content: md }, ctx);

    expect(result.success).toBe(true);
    expect(result.output!.paragraphs).toBe(6);

    const text = await extractText(outPath);
    expect(text).toContain('Heading 1');
    expect(text).toContain('Heading 6');
  });

  // ── Bold and italic ────────────────────────────────────────────────────

  it('creates docx with **bold** and *italic*', async () => {
    const outPath = path.join(tmpDir, 'formatting.docx');
    const md = 'This is **bold** and this is *italic* text.';

    const result = await tool.execute({ path: outPath, content: md }, ctx);

    expect(result.success).toBe(true);

    const text = await extractText(outPath);
    // Markdown markers should be stripped, leaving just the text
    expect(text).toContain('bold');
    expect(text).toContain('italic');
    expect(text).not.toContain('**');
    expect(text).not.toContain('*italic*');
  });

  // ── Bullet lists ───────────────────────────────────────────────────────

  it('creates docx with - bullet lists', async () => {
    const outPath = path.join(tmpDir, 'bullets.docx');
    const md = [
      '- First item',
      '- Second item',
      '- Third item',
    ].join('\n');

    const result = await tool.execute({ path: outPath, content: md }, ctx);

    expect(result.success).toBe(true);
    expect(result.output!.paragraphs).toBe(3);

    const text = await extractText(outPath);
    expect(text).toContain('First item');
    expect(text).toContain('Third item');
  });

  // ── Mixed markdown content ─────────────────────────────────────────────

  it('creates docx with mixed markdown content', async () => {
    const outPath = path.join(tmpDir, 'mixed.docx');
    const md = [
      '# Report Title',
      '',
      'This is the **introduction** paragraph with *emphasis*.',
      '',
      '## Section One',
      '',
      '- Point A',
      '- Point B',
      '',
      'Closing paragraph.',
    ].join('\n');

    const result = await tool.execute({ path: outPath, content: md }, ctx);

    expect(result.success).toBe(true);
    // Blank lines are skipped, so: heading + para + heading + 2 bullets + para = 6
    expect(result.output!.paragraphs).toBe(6);

    const text = await extractText(outPath);
    expect(text).toContain('Report Title');
    expect(text).toContain('introduction');
    expect(text).toContain('Point A');
    expect(text).toContain('Closing paragraph');
  });

  // ── Document metadata ──────────────────────────────────────────────────

  it('sets document metadata (title, author, subject)', async () => {
    const outPath = path.join(tmpDir, 'meta.docx');
    const result = await tool.execute(
      {
        path: outPath,
        content: 'Content here.',
        title: 'My Title',
        author: 'Test Author',
        subject: 'Test Subject',
      },
      ctx,
    );

    expect(result.success).toBe(true);

    // Verify the file was written and is valid docx by extracting text
    const text = await extractText(outPath);
    expect(text).toContain('Content here.');

    // Verify metadata by reading the raw docx XML (core.xml in the zip)
    const JSZip = (await import('jszip')).default ?? (await import('jszip'));
    const buf = await fs.readFile(outPath);
    const zip = await JSZip.loadAsync(buf);
    const coreXml = await zip.file('docProps/core.xml')?.async('text');
    if (coreXml) {
      expect(coreXml).toContain('My Title');
      expect(coreXml).toContain('Test Author');
      expect(coreXml).toContain('Test Subject');
    }
  });

  // ── Validation ─────────────────────────────────────────────────────────

  it('validates path and content are required', () => {
    const v1 = tool.validateArgs({});
    expect(v1.isValid).toBe(false);
    expect(v1.errors!.some((e: any) => /path/i.test(String(e)))).toBe(true);
    expect(v1.errors!.some((e: any) => /content/i.test(String(e)))).toBe(true);

    const v2 = tool.validateArgs({ path: '/tmp/x.docx' });
    expect(v2.isValid).toBe(false);
    expect(v2.errors!.some((e: any) => /content/i.test(String(e)))).toBe(true);

    const v3 = tool.validateArgs({ path: '/tmp/x.docx', content: 'ok' });
    expect(v3.isValid).toBe(true);
  });

  // ── Fallback for empty content ─────────────────────────────────────────

  it('falls back to single paragraph if content produces no parseable paragraphs', async () => {
    const outPath = path.join(tmpDir, 'fallback.docx');
    // Only whitespace lines — parseMarkdown will skip them all
    const result = await tool.execute({ path: outPath, content: '   \n   \n   ' }, ctx);

    expect(result.success).toBe(true);
    // Should have exactly 1 fallback paragraph
    expect(result.output!.paragraphs).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. FileWriteTool — redirect guards
// ═══════════════════════════════════════════════════════════════════════════

describe('FileWriteTool redirect guards', () => {
  const mockShellService = {
    writeFile: vi.fn().mockResolvedValue({
      path: '/test/output.txt',
      bytesWritten: 10,
      created: true,
      appended: false,
    }),
    readFile: vi.fn(),
    readFileBuffer: vi.fn(),
    listDirectory: vi.fn(),
    execute: vi.fn(),
  } as any;

  const tool = new FileWriteTool(mockShellService);

  // ── Blocked extensions ─────────────────────────────────────────────────

  it('rejects .xlsx with redirect message to create_spreadsheet', async () => {
    const result = await tool.execute(
      { path: '/tmp/report.xlsx', content: 'data' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('create_spreadsheet');
  });

  it('rejects .xls with redirect message to create_spreadsheet', async () => {
    const result = await tool.execute(
      { path: '/tmp/report.xls', content: 'data' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('create_spreadsheet');
  });

  it('rejects .docx with redirect message to create_document', async () => {
    const result = await tool.execute(
      { path: '/tmp/report.docx', content: 'data' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('create_document');
  });

  it('rejects .pdf with redirect message to create_pdf', async () => {
    const result = await tool.execute(
      { path: '/tmp/report.pdf', content: 'data' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('create_pdf');
  });

  // ── Allowed extensions ─────────────────────────────────────────────────

  it('allows .txt writes (passes through to shellService)', async () => {
    mockShellService.writeFile.mockClear();
    const result = await tool.execute(
      { path: '/tmp/notes.txt', content: 'hello' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(mockShellService.writeFile).toHaveBeenCalledTimes(1);
  });

  it('allows .json writes', async () => {
    mockShellService.writeFile.mockClear();
    const result = await tool.execute(
      { path: '/tmp/config.json', content: '{}' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(mockShellService.writeFile).toHaveBeenCalledTimes(1);
  });

  it('allows .csv writes (text-based, not a binary format)', async () => {
    mockShellService.writeFile.mockClear();
    const result = await tool.execute(
      { path: '/tmp/data.csv', content: 'a,b\n1,2' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(mockShellService.writeFile).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Extension pack registration
// ═══════════════════════════════════════════════════════════════════════════

describe('createExtensionPack', () => {
  const pack = createExtensionPack({
    options: {},
    logger: { info: () => undefined },
  });

  it('includes all 6 tool descriptors', () => {
    expect(pack.descriptors).toHaveLength(6);
    expect(pack.descriptors.every((d: any) => d.kind === 'tool')).toBe(true);
  });

  it('tool names match expected values', () => {
    const names = pack.descriptors.map((d: any) => d.id).sort();
    expect(names).toEqual([
      'create_document',
      'create_spreadsheet',
      'file_read',
      'file_write',
      'list_directory',
      'shell_execute',
    ]);
  });
});
