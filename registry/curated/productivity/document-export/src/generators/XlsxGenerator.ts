/**
 * @module XlsxGenerator
 *
 * Generates an XLSX workbook buffer from structured {@link DocumentContent}
 * using the `exceljs` library. Each section that contains a table or
 * key-value data becomes its own worksheet with:
 *
 * - Bold, colour-accented header rows
 * - Auto-detected numeric columns with number formatting
 * - SUM formula appended to numeric columns
 * - Frozen first row for easy scrolling
 * - Auto-sized column widths
 *
 * Theme-aware: when `content.theme` is set the header accent colour is
 * drawn from the matching {@link SlideTheme} (once the theme map is wired
 * in). For now a sensible default blue (`#2563eb`) is used.
 */

import ExcelJS from 'exceljs';

import type { DocumentContent, ExportOptions, TableData } from '../types.js';

/** Default accent colour applied to header rows when no theme is specified. */
const DEFAULT_ACCENT_HEX = '2563eb';

/**
 * Stateless XLSX generator that converts {@link DocumentContent} sections
 * into a multi-sheet Excel workbook.
 *
 * @example
 * ```ts
 * const xlsx = new XlsxGenerator();
 * const buffer = await xlsx.generate(content, { sheetName: 'Q4 Results' });
 * fs.writeFileSync('report.xlsx', buffer);
 * ```
 */
export class XlsxGenerator {
  /**
   * Generate an XLSX buffer from the provided document content.
   *
   * Processing steps:
   *
   * 1. Create a new `ExcelJS.Workbook` and populate its metadata (title,
   *    author, creation date) from the content fields.
   * 2. Iterate over every section:
   *    - Sections with a `table` become a worksheet with headers + data.
   *    - Sections with `keyValues` become a two-column worksheet.
   * 3. For each worksheet: apply header styling, auto-column widths,
   *    numeric detection, SUM formulas, and freeze the header row.
   * 4. Serialise the workbook to a Node.js Buffer via
   *    `workbook.xlsx.writeBuffer()`.
   *
   * @param content - The structured document content to render.
   * @param options - Optional export configuration (e.g. explicit sheet name).
   * @returns A Buffer containing the complete XLSX binary data.
   */
  async generate(content: DocumentContent, options?: ExportOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // ---- Workbook metadata ----
    workbook.title = content.title;
    workbook.creator = content.author ?? 'Document Export Extension';
    workbook.created = content.date ? new Date(content.date) : new Date();

    // Resolve accent colour (theme support will expand this later).
    const accentHex = DEFAULT_ACCENT_HEX;

    let sheetIndex = 0;

    for (const section of content.sections) {
      // ---- Table data → worksheet ----
      if (section.table) {
        const sheetName = this.resolveSheetName(
          section.heading,
          sheetIndex,
          options?.sheetName,
        );

        const worksheet = workbook.addWorksheet(sheetName);
        this.populateTableSheet(worksheet, section.table, accentHex);
        sheetIndex++;
      }

      // ---- Key-value pairs → two-column worksheet ----
      if (section.keyValues && section.keyValues.length > 0) {
        const sheetName = this.resolveSheetName(
          section.heading,
          sheetIndex,
          options?.sheetName,
        );

        const worksheet = workbook.addWorksheet(sheetName);

        // Build a synthetic TableData from key-values
        const syntheticTable: TableData = {
          headers: ['Key', 'Value'],
          rows: section.keyValues.map((kv) => [kv.key, kv.value]),
        };

        this.populateTableSheet(worksheet, syntheticTable, accentHex);
        sheetIndex++;
      }
    }

    // If no sheets were created, add a placeholder so the file is valid.
    if (sheetIndex === 0) {
      const ws = workbook.addWorksheet('Sheet 1');
      ws.addRow([content.title || 'Empty document']);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Populate a worksheet with header + data rows, then apply formatting.
   *
   * @param worksheet - The target ExcelJS worksheet.
   * @param table     - Table data (headers + rows).
   * @param accentHex - Hex colour string (without `#`) for header fill.
   */
  private populateTableSheet(
    worksheet: ExcelJS.Worksheet,
    table: TableData,
    accentHex: string,
  ): void {
    const columnCount = table.headers.length;

    // ---- Header row ----
    const headerRow = worksheet.addRow(table.headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${accentHex.toUpperCase()}` },
    };

    // ---- Data rows ----
    // Track which columns are entirely numeric so we can add SUM later.
    const numericColumns = new Array<boolean>(columnCount).fill(true);

    for (const rowData of table.rows) {
      const values: (string | number)[] = rowData.map((cell, colIdx) => {
        const trimmed = cell.trim();
        const asNumber = Number(trimmed);

        if (trimmed.length > 0 && !Number.isNaN(asNumber)) {
          return asNumber;
        }

        // Not a number — mark column as non-numeric
        numericColumns[colIdx] = false;
        return cell;
      });

      worksheet.addRow(values);
    }

    // ---- Numeric column formatting ----
    for (let colIdx = 0; colIdx < columnCount; colIdx++) {
      if (numericColumns[colIdx] && table.rows.length > 0) {
        const col = worksheet.getColumn(colIdx + 1); // 1-based
        col.numFmt = '#,##0.##';
      }
    }

    // ---- SUM formula row for numeric columns ----
    if (table.rows.length > 0) {
      const sumRow: (string | { formula: string })[] = [];
      const firstDataRow = 2; // row 1 = header
      const lastDataRow = 1 + table.rows.length;

      for (let colIdx = 0; colIdx < columnCount; colIdx++) {
        if (numericColumns[colIdx]) {
          const colLetter = this.columnIndexToLetter(colIdx);
          sumRow.push({ formula: `SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})` });
        } else {
          // First non-numeric column in the sum row gets a label
          sumRow.push(sumRow.length === 0 ? 'Total' : '');
        }
      }

      // Only add a SUM row if at least one column is numeric
      if (numericColumns.some(Boolean)) {
        const addedRow = worksheet.addRow(sumRow);
        addedRow.font = { bold: true };
      }
    }

    // ---- Auto-column widths ----
    for (let colIdx = 0; colIdx < columnCount; colIdx++) {
      const headerLen = table.headers[colIdx]?.length ?? 0;
      let maxDataLen = 0;

      for (const row of table.rows) {
        const cellLen = (row[colIdx] ?? '').length;
        if (cellLen > maxDataLen) {
          maxDataLen = cellLen;
        }
      }

      // Add 2 characters of padding
      const width = Math.max(headerLen, maxDataLen) + 2;
      worksheet.getColumn(colIdx + 1).width = Math.min(width, 60); // cap at 60
    }

    // ---- Freeze first row ----
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  }

  /**
   * Determine the worksheet name. Prefers an explicit `sheetName` from
   * options (only for the first sheet), then falls back to the section
   * heading, and finally to "Sheet N".
   *
   * Excel sheet names are capped at 31 characters and must not contain
   * certain special characters.
   *
   * @param heading    - The section heading (may be undefined).
   * @param sheetIndex - Zero-based index of the sheet being created.
   * @param override   - Explicit sheet name from {@link ExportOptions}.
   * @returns A sanitised worksheet name.
   */
  private resolveSheetName(
    heading: string | undefined,
    sheetIndex: number,
    override?: string,
  ): string {
    let raw: string;

    if (sheetIndex === 0 && override) {
      raw = override;
    } else if (heading) {
      raw = heading;
    } else {
      raw = `Sheet ${sheetIndex + 1}`;
    }

    // Remove characters illegal in Excel sheet names: \ / ? * [ ]
    const sanitised = raw.replace(/[\\/?*[\]]/g, '_');

    // Truncate to 31 characters (Excel limit)
    return sanitised.slice(0, 31);
  }

  /**
   * Convert a zero-based column index to an Excel-style column letter
   * (0 → "A", 1 → "B", ..., 25 → "Z", 26 → "AA", etc.).
   *
   * @param index - Zero-based column index.
   * @returns The corresponding uppercase column letter(s).
   */
  private columnIndexToLetter(index: number): string {
    let result = '';
    let remaining = index;

    while (remaining >= 0) {
      result = String.fromCharCode((remaining % 26) + 65) + result;
      remaining = Math.floor(remaining / 26) - 1;
    }

    return result;
  }
}
