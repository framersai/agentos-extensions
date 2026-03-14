/**
 * Create Spreadsheet Tool
 * Generate XLSX or CSV files from structured data.
 *
 * @module @framers/agentos-ext-cli-executor
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';

type OutputFormat = 'xlsx' | 'csv';

/**
 * Parse a markdown-style table into headers + rows.
 *
 * Accepts tables like:
 *   | Name | Age |
 *   | --- | --- |
 *   | Alice | 30 |
 *   | Bob | 25 |
 */
function parseMarkdownTable(markdown: string): { headers: string[]; rows: string[][] } | null {
  const lines = markdown
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'));

  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] =>
    line
      .slice(1, -1) // strip leading/trailing |
      .split('|')
      .map((cell) => cell.trim());

  const headers = parseRow(lines[0]);

  // Skip separator row (| --- | --- |)
  const startIdx = /^[\s|:-]+$/.test(lines[1].replace(/\|/g, '').trim()) ? 2 : 1;
  const rows = lines.slice(startIdx).map(parseRow);

  return { headers, rows };
}

export class CreateSpreadsheetTool implements ITool {
  public readonly id = 'cli-create-spreadsheet-v1';
  public readonly name = 'create_spreadsheet';
  public readonly displayName = 'Create Spreadsheet';
  public readonly description =
    'Create an Excel (.xlsx) or CSV (.csv) file from structured data. ' +
    'Accepts data as a JSON array of rows (with headers), or as a markdown table string. ' +
    'Use this instead of file_write when the user asks for a spreadsheet or CSV.';
  public readonly category = 'system';
  public readonly hasSideEffects = true;

  public readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    required: ['path'],
    properties: {
      path: {
        type: 'string',
        description: 'Output file path (should end in .xlsx or .csv)',
      },
      headers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Column headers. Required when using the rows parameter.',
      },
      rows: {
        type: 'array',
        items: {
          type: 'array',
          items: {},
        },
        description:
          'Data rows as a 2D array: [[val, val, ...], ...]. ' +
          'Each inner array is one row. Values can be strings, numbers, or booleans.',
      },
      data: {
        type: 'array',
        items: {
          type: 'object',
        },
        description:
          'Alternative: array of objects. Keys become column headers. ' +
          'Example: [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]',
      },
      markdown: {
        type: 'string',
        description:
          'Alternative: a markdown table string. Parsed into headers and rows automatically.',
      },
      sheetName: {
        type: 'string',
        description: 'Sheet name for xlsx files (default: "Sheet1")',
      },
      format: {
        type: 'string',
        enum: ['xlsx', 'csv', 'auto'],
        default: 'auto',
        description: 'Output format. Auto-detected from file extension if not specified.',
      },
    },
    additionalProperties: false,
  };

  async execute(
    input: {
      path: string;
      headers?: string[];
      rows?: any[][];
      data?: Record<string, any>[];
      markdown?: string;
      sheetName?: string;
      format?: string;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ path: string; format: string; rows: number; bytes: number }>> {
    try {
      const outPath = resolve(input.path);

      // Detect format
      let format: OutputFormat;
      if (input.format && input.format !== 'auto') {
        format = input.format as OutputFormat;
      } else {
        const ext = extname(outPath).toLowerCase();
        format = ext === '.csv' ? 'csv' : 'xlsx';
      }

      // Resolve headers + rows from one of the three input forms
      let headers: string[];
      let rows: any[][];

      if (input.markdown) {
        const parsed = parseMarkdownTable(input.markdown);
        if (!parsed) {
          return { success: false, error: 'Could not parse markdown table. Ensure it has | header | rows.' };
        }
        headers = parsed.headers;
        rows = parsed.rows;
      } else if (input.data && input.data.length > 0) {
        // Object array → extract keys as headers
        const keySet = new Set<string>();
        for (const obj of input.data) {
          for (const k of Object.keys(obj)) keySet.add(k);
        }
        headers = [...keySet];
        rows = input.data.map((obj) => headers.map((h) => obj[h] ?? ''));
      } else if (input.headers && input.rows) {
        headers = input.headers;
        rows = input.rows;
      } else {
        return {
          success: false,
          error:
            'Provide data in one of three forms: (1) headers + rows, (2) data (array of objects), or (3) markdown table string.',
        };
      }

      await mkdir(dirname(outPath), { recursive: true });

      if (format === 'csv') {
        // Generate CSV without pulling in xlsx
        const escapeCSV = (val: unknown): string => {
          const s = val === null || val === undefined ? '' : String(val);
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        };
        const lines = [
          headers.map(escapeCSV).join(','),
          ...rows.map((row) => row.map(escapeCSV).join(',')),
        ];
        const csvContent = lines.join('\n') + '\n';
        await writeFile(outPath, csvContent, 'utf-8');

        return {
          success: true,
          output: { path: outPath, format: 'csv', rows: rows.length, bytes: Buffer.byteLength(csvContent) },
        };
      }

      // XLSX
      const XLSX = await import('xlsx');
      const wsData = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, input.sheetName || 'Sheet1');
      const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      await writeFile(outPath, xlsxBuffer);

      return {
        success: true,
        output: { path: outPath, format: 'xlsx', rows: rows.length, bytes: xlsxBuffer.length },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(input: Record<string, any>): { isValid: boolean; errors?: any[] } {
    const errors: string[] = [];
    if (!input.path || typeof input.path !== 'string') errors.push('path is required (string)');
    const hasData = !!(input.data && Array.isArray(input.data) && input.data.length > 0);
    const hasRowsPair = !!(input.headers && input.rows);
    const hasMarkdown = !!(input.markdown && typeof input.markdown === 'string');
    if (!hasData && !hasRowsPair && !hasMarkdown) {
      errors.push('Provide one of: headers+rows, data (array of objects), or markdown (table string)');
    }
    return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
  }
}
