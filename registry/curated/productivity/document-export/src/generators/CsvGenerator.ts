/**
 * @module CsvGenerator
 *
 * Generates a CSV buffer from structured {@link DocumentContent}. Scans all
 * sections for tabular data ({@link TableData} and key-value pairs) and
 * serialises them into RFC 4180-compliant CSV using `csv-stringify/sync`.
 *
 * Multiple tables are separated by a blank row so the resulting file can
 * be opened in any spreadsheet application without ambiguity.
 */

import { stringify } from 'csv-stringify/sync';

import type { DocumentContent } from '../types.js';

/**
 * Stateless CSV generator that converts {@link DocumentContent} sections
 * into a single CSV buffer.
 *
 * @example
 * ```ts
 * const csv = new CsvGenerator();
 * const buffer = await csv.generate(content);
 * fs.writeFileSync('report.csv', buffer);
 * ```
 */
export class CsvGenerator {
  /**
   * Generate a CSV buffer from the provided document content.
   *
   * The generator inspects every section in order and collects rows from:
   *
   * 1. **Tables** — header row followed by all data rows.
   * 2. **Key-value pairs** — rendered as a two-column table (Key, Value).
   *
   * When multiple tabular blocks are found they are separated by a single
   * blank row in the output.
   *
   * @param content - The structured document content to serialise.
   * @returns A UTF-8 encoded Buffer containing the CSV data.
   * @throws {Error} When no tabular data (tables or key-values) is found
   *   in any section. The error message suggests using PDF or DOCX instead.
   */
  async generate(content: DocumentContent): Promise<Buffer> {
    const allRows: string[][] = [];
    let tabularBlockCount = 0;

    for (const section of content.sections) {
      // ---- Table data ----
      if (section.table) {
        // Separate consecutive tables with a blank row
        if (tabularBlockCount > 0) {
          allRows.push([]);
        }

        // Header row
        allRows.push(section.table.headers);

        // Data rows
        for (const row of section.table.rows) {
          allRows.push(row);
        }

        tabularBlockCount++;
      }

      // ---- Key-value pairs ----
      if (section.keyValues && section.keyValues.length > 0) {
        if (tabularBlockCount > 0) {
          allRows.push([]);
        }

        // Two-column header
        allRows.push(['Key', 'Value']);

        for (const kv of section.keyValues) {
          allRows.push([kv.key, kv.value]);
        }

        tabularBlockCount++;
      }
    }

    if (tabularBlockCount === 0) {
      throw new Error(
        'No tabular data found for CSV export. Try PDF or DOCX instead.',
      );
    }

    const csvString = stringify(allRows);
    return Buffer.from(csvString, 'utf-8');
  }
}
