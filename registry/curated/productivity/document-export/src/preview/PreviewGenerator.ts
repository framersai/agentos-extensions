// @ts-nocheck
/**
 * @module PreviewGenerator
 *
 * Generates format-specific previews for exported documents. The preview
 * is a lightweight representation — typically an HTML table for tabular
 * formats or a plain-text summary for binary document formats — that can
 * be served inline via an HTTP endpoint without requiring the user to
 * download the full file.
 *
 * This is a v1 implementation with simple strategies. Future versions may
 * add thumbnail rendering, first-page PDF-to-image conversion, and richer
 * DOCX/PPTX content extraction.
 */

import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import ExcelJS from 'exceljs';

/**
 * The result of generating a preview for a document file.
 */
export interface PreviewResult {
  /** MIME content type of the preview body (e.g. `text/html`, `text/plain`). */
  contentType: string;

  /** The preview content — either an HTML string or a plain-text summary. */
  body: Buffer | string;
}

/**
 * Generates lightweight, format-specific previews for exported documents.
 *
 * @example
 * ```ts
 * const preview = new PreviewGenerator();
 * const { contentType, body } = await preview.generatePreview('/exports/report.csv', 'csv');
 * // contentType → 'text/html'
 * // body → '<html>...<table>...</table>...</html>'
 * ```
 */
export class PreviewGenerator {
  /**
   * Generate a preview for the given document file.
   *
   * Dispatches to a format-specific strategy based on the `format`
   * parameter. Unsupported formats receive a generic plain-text summary.
   *
   * @param filePath - Absolute path to the exported file on disk.
   * @param format   - The document format (e.g. `'csv'`, `'xlsx'`, `'pdf'`).
   * @returns A {@link PreviewResult} containing the content type and body.
   */
  async generatePreview(filePath: string, format: string): Promise<PreviewResult> {
    switch (format.toLowerCase()) {
      case 'csv':
        return this.previewCsv(filePath);

      case 'xlsx':
        return this.previewXlsx(filePath);

      case 'pdf':
        return this.previewPdf(filePath);

      case 'docx':
        return this.previewDocx(filePath);

      case 'pptx':
        return this.previewPptx(filePath);

      default:
        return this.previewGeneric(filePath, format);
    }
  }

  // -------------------------------------------------------------------------
  // Private — CSV preview
  // -------------------------------------------------------------------------

  /**
   * Read the CSV file and render the first 10 lines as a styled HTML table.
   *
   * The first line is treated as the header row. Lines are split on commas
   * with basic quote handling. The HTML includes inline CSS for a clean,
   * readable presentation.
   *
   * @param filePath - Absolute path to the CSV file.
   * @returns An HTML preview with content type `text/html`.
   */
  private async previewCsv(filePath: string): Promise<PreviewResult> {
    const raw = await readFile(filePath, 'utf-8');
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);
    const previewLines = lines.slice(0, 10);

    // Parse each line into cells (basic comma split with quote awareness)
    const rows = previewLines.map((line) => this.parseCsvLine(line));

    const headerRow = rows[0] ?? [];
    const dataRows = rows.slice(1);

    const headerHtml = headerRow
      .map((cell) => `<th>${this.escapeHtml(cell)}</th>`)
      .join('');

    const bodyHtml = dataRows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td>${this.escapeHtml(cell)}</td>`).join('')}</tr>`,
      )
      .join('\n');

    const truncatedNote =
      lines.length > 10
        ? `<p style="color:#666;font-size:12px;margin-top:8px;">Showing first 10 of ${lines.length} rows</p>`
        : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CSV Preview</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; }
    table { border-collapse: collapse; width: 100%; max-width: 900px; }
    th { background: #2563eb; color: #fff; padding: 8px 12px; text-align: left; font-size: 13px; }
    td { padding: 6px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    tr:nth-child(even) { background: #f8f9fa; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
  ${truncatedNote}
</body>
</html>`;

    return { contentType: 'text/html', body: html };
  }

  // -------------------------------------------------------------------------
  // Private — XLSX preview
  // -------------------------------------------------------------------------

  /**
   * Read the XLSX file using ExcelJS, extract the first worksheet's first
   * 10 rows, and render them as a styled HTML table.
   *
   * @param filePath - Absolute path to the XLSX file.
   * @returns An HTML preview with content type `text/html`.
   */
  private async previewXlsx(filePath: string): Promise<PreviewResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      return { contentType: 'text/plain', body: 'XLSX: Empty workbook (no sheets)' };
    }

    const rows: string[][] = [];
    let rowCount = 0;

    worksheet.eachRow((row, _rowNumber) => {
      if (rowCount >= 10) return;

      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        cells.push(String(cell.value ?? ''));
      });

      rows.push(cells);
      rowCount++;
    });

    if (rows.length === 0) {
      return { contentType: 'text/plain', body: `XLSX: ${worksheet.name} (empty sheet)` };
    }

    const headerRow = rows[0] ?? [];
    const dataRows = rows.slice(1);
    const totalRows = worksheet.rowCount;

    const headerHtml = headerRow
      .map((cell) => `<th>${this.escapeHtml(cell)}</th>`)
      .join('');

    const bodyHtml = dataRows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td>${this.escapeHtml(cell)}</td>`).join('')}</tr>`,
      )
      .join('\n');

    const truncatedNote =
      totalRows > 10
        ? `<p style="color:#666;font-size:12px;margin-top:8px;">Showing first 10 of ${totalRows} rows from "${worksheet.name}"</p>`
        : `<p style="color:#666;font-size:12px;margin-top:8px;">Sheet: "${worksheet.name}"</p>`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>XLSX Preview</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; }
    table { border-collapse: collapse; width: 100%; max-width: 900px; }
    th { background: #2563eb; color: #fff; padding: 8px 12px; text-align: left; font-size: 13px; }
    td { padding: 6px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    tr:nth-child(even) { background: #f8f9fa; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
  ${truncatedNote}
</body>
</html>`;

    return { contentType: 'text/html', body: html };
  }

  // -------------------------------------------------------------------------
  // Private — PDF preview
  // -------------------------------------------------------------------------

  /**
   * Generate a plain-text summary for a PDF file. Reads the first 500
   * bytes to attempt title extraction from the PDF header, and includes
   * the total file size.
   *
   * @param filePath - Absolute path to the PDF file.
   * @returns A plain-text summary with content type `text/plain`.
   */
  private async previewPdf(filePath: string): Promise<PreviewResult> {
    const fileStat = await stat(filePath);
    const headerBuffer = Buffer.alloc(500);
    const fileHandle = await readFile(filePath);
    fileHandle.copy(headerBuffer, 0, 0, Math.min(500, fileHandle.length));

    const headerText = headerBuffer.toString('latin1');

    // Attempt to extract the /Title from PDF metadata
    let title = 'Untitled';
    const titleMatch = headerText.match(/\/Title\s*\(([^)]+)\)/);
    if (titleMatch?.[1]) {
      title = titleMatch[1];
    }

    const sizeKb = Math.round(fileStat.size / 1024);
    const body = `PDF: ${title}, ${sizeKb > 0 ? sizeKb : '<1'} KB (${fileStat.size} bytes)`;

    return { contentType: 'text/plain', body };
  }

  // -------------------------------------------------------------------------
  // Private — DOCX preview
  // -------------------------------------------------------------------------

  /**
   * Generate a plain-text summary for a DOCX file, including the filename
   * and file size.
   *
   * @param filePath - Absolute path to the DOCX file.
   * @returns A plain-text summary with content type `text/plain`.
   */
  private async previewDocx(filePath: string): Promise<PreviewResult> {
    const fileStat = await stat(filePath);
    const filename = basename(filePath);
    const sizeKb = Math.round(fileStat.size / 1024);
    const body = `DOCX: ${filename}, ${sizeKb > 0 ? sizeKb : '<1'} KB (${fileStat.size} bytes)`;

    return { contentType: 'text/plain', body };
  }

  // -------------------------------------------------------------------------
  // Private — PPTX preview
  // -------------------------------------------------------------------------

  /**
   * Generate a plain-text summary for a PPTX file, including the filename
   * and file size.
   *
   * @param filePath - Absolute path to the PPTX file.
   * @returns A plain-text summary with content type `text/plain`.
   */
  private async previewPptx(filePath: string): Promise<PreviewResult> {
    const fileStat = await stat(filePath);
    const filename = basename(filePath);
    const sizeKb = Math.round(fileStat.size / 1024);
    const body = `PPTX: ${filename}, ${sizeKb > 0 ? sizeKb : '<1'} KB (${fileStat.size} bytes)`;

    return { contentType: 'text/plain', body };
  }

  // -------------------------------------------------------------------------
  // Private — Generic preview
  // -------------------------------------------------------------------------

  /**
   * Generate a generic plain-text summary for unsupported formats.
   *
   * @param filePath - Absolute path to the file.
   * @param format   - The file format string.
   * @returns A plain-text summary with content type `text/plain`.
   */
  private async previewGeneric(filePath: string, format: string): Promise<PreviewResult> {
    const fileStat = await stat(filePath);
    const filename = basename(filePath);
    const sizeKb = Math.round(fileStat.size / 1024);
    const body = `${format.toUpperCase()}: ${filename}, ${sizeKb > 0 ? sizeKb : '<1'} KB (${fileStat.size} bytes)`;

    return { contentType: 'text/plain', body };
  }

  // -------------------------------------------------------------------------
  // Private — Utilities
  // -------------------------------------------------------------------------

  /**
   * Parse a single CSV line into an array of cell values.
   *
   * Handles basic quoted fields (double-quote delimited) so that commas
   * inside quotes do not split the field. Does not handle escaped quotes
   * within quoted fields (a limitation of this simple parser).
   *
   * @param line - A single line from a CSV file.
   * @returns An array of trimmed cell value strings.
   */
  private parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;

      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }

    cells.push(current.trim());
    return cells;
  }

  /**
   * Escape HTML special characters to prevent XSS in generated previews.
   *
   * @param text - Raw text to escape.
   * @returns HTML-safe string with `&`, `<`, `>`, `"`, and `'` replaced.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}
