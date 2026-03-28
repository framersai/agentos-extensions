/**
 * @module PdfGenerator
 *
 * Generates styled, multi-page PDF documents from structured
 * {@link DocumentContent} using the `pdfkit` library. Supports:
 *
 * - Cover page with title, subtitle, author, and date
 * - Section headings (level 1 / 2 / 3) with proportional sizing
 * - Rich paragraphs with basic Markdown: **bold**, *italic*, [links](url)
 * - Tables with accent-coloured headers, alternating row stripes, and
 *   automatic page-break continuation with repeated headers
 * - Charts via {@link ChartRenderer} (rendered as titled tables)
 * - Images from URLs (fetched) or base64 data URIs, with optional captions
 * - Bulleted and numbered lists
 * - Key-value pairs as inline definitions or two-column mini-tables
 * - Automatic headers (document title) and footers (page numbers)
 *
 * The generator pipes the PDFDocument to a `PassThrough` stream, collects
 * the chunks, and returns a single Buffer suitable for writing to disk or
 * streaming to an HTTP response.
 */

import PDFDocument from 'pdfkit';
import { PassThrough } from 'node:stream';

import type {
  DocumentContent,
  DocumentSection,
  ExportOptions,
  TableData,
  ImageSpec,
} from '../types.js';
import { ChartRenderer } from './ChartRenderer.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default page margins in points (72pt = 1 inch). */
const MARGIN = 72;

/** Accent colour used for table headers, links, and decorative elements. */
const ACCENT_HEX = '#2563eb';

/** Muted text colour for subtitles, captions, dates. */
const MUTED_HEX = '#6b7280';

/** Alternating row stripe colour for table data rows. */
const STRIPE_HEX = '#f8f9fa';

/** Default body text font size in points. */
const BODY_FONT_SIZE = 11;

/** Row padding (vertical, per side) inside table cells. */
const CELL_PADDING_Y = 4;

/** Row padding (horizontal, per side) inside table cells. */
const CELL_PADDING_X = 6;

/** Minimum vertical space (points) required before adding new content;
 *  triggers a page break when remaining space is less than this. */
const PAGE_BREAK_THRESHOLD = 80;

/** Timeout in milliseconds for fetching remote images. */
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

/** Font size map for heading levels. */
const HEADING_FONT_SIZES: Record<number, number> = {
  1: 20,
  2: 16,
  3: 14,
};

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

/**
 * Stateless PDF generator that converts {@link DocumentContent} sections
 * into a multi-page, styled PDF buffer.
 *
 * @example
 * ```ts
 * const pdf = new PdfGenerator();
 * const buffer = await pdf.generate(content, { pageSize: 'a4', orientation: 'portrait' });
 * fs.writeFileSync('report.pdf', buffer);
 * ```
 */
export class PdfGenerator {
  /** Chart renderer instance used to convert ChartSpec → TableData. */
  private readonly chartRenderer = new ChartRenderer();

  /**
   * Generate a PDF buffer from the provided document content.
   *
   * Processing steps:
   *
   * 1. Create a `PDFDocument` with the requested page size and orientation.
   * 2. Pipe the document to a `PassThrough` stream and collect chunks.
   * 3. Register a `pageAdded` event handler for headers and footers.
   * 4. Optionally render a cover page.
   * 5. Iterate over all sections, rendering headings, paragraphs, tables,
   *    charts, images, lists, and key-value pairs in order.
   * 6. Call `doc.end()` to finalise the stream.
   * 7. Return the concatenated buffer.
   *
   * @param content - The structured document content to render.
   * @param options - Optional export configuration overrides.
   * @returns A Buffer containing the complete PDF binary data.
   */
  async generate(content: DocumentContent, options?: ExportOptions): Promise<Buffer> {
    const pageSize = options?.pageSize ?? 'letter';
    const orientation = options?.orientation ?? 'portrait';
    const showCover = options?.coverPage !== false;
    const showPageNumbers = options?.pageNumbers !== false;

    // ---- Create document ----
    const doc = new PDFDocument({
      size: pageSize,
      layout: orientation,
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: false,
      bufferPages: true,
      info: {
        Title: content.title,
        Author: content.author ?? 'Document Export Extension',
        CreationDate: content.date ? new Date(content.date) : new Date(),
      },
    });

    // ---- Collect output chunks via PassThrough ----
    const chunks: Buffer[] = [];
    const stream = new PassThrough();
    doc.pipe(stream);
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));

    // ---- Add the first page ----
    doc.addPage();

    // ---- Cover page ----
    if (showCover) {
      this.renderCoverPage(doc, content);
      doc.addPage();
    }

    // ---- Render sections ----
    for (const section of content.sections) {
      await this.renderSection(doc, section, content.title, showPageNumbers);
    }

    // ---- Write headers/footers on all buffered pages ----
    const pageRange = doc.bufferedPageRange();
    const totalPages = pageRange.count;
    // Determine the first content page (skip cover if present)
    const firstContentPage = showCover ? 1 : 0;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      // Skip cover page for header/footer
      if (showCover && i === 0) continue;

      // ---- Header: title right-aligned ----
      doc.save();
      doc.fontSize(8).font('Helvetica').fillColor(MUTED_HEX);
      const headerY = MARGIN / 2 - 4;
      const pageWidth = doc.page.width;
      doc.text(content.title, MARGIN, headerY, {
        width: pageWidth - MARGIN * 2,
        align: 'right',
      });
      doc.restore();

      // ---- Footer: page number centred ----
      if (showPageNumbers) {
        doc.save();
        doc.fontSize(9).font('Helvetica').fillColor(MUTED_HEX);
        const footerY = doc.page.height - MARGIN / 2 - 4;
        const pageNum = i - firstContentPage + 1;
        doc.text(String(pageNum), MARGIN, footerY, {
          width: pageWidth - MARGIN * 2,
          align: 'center',
        });
        doc.restore();
      }
    }

    // ---- Finalise ----
    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
      doc.end();
    });

    return Buffer.concat(chunks);
  }

  // -----------------------------------------------------------------------
  // Private — Cover page
  // -----------------------------------------------------------------------

  /**
   * Render a cover page with centred title, subtitle, author, and date.
   *
   * Layout:
   * - Title at ~40% page height, 28pt bold
   * - Subtitle immediately below, 16pt regular, muted colour
   * - Author and date at ~70% page height, 12pt, muted colour
   *
   * @param doc     - The active PDFDocument.
   * @param content - Document content (title, subtitle, author, date).
   */
  private renderCoverPage(doc: PDFKit.PDFDocument, content: DocumentContent): void {
    const pageHeight = doc.page.height;
    const pageWidth = doc.page.width;
    const textWidth = pageWidth - MARGIN * 2;

    // Title at 40% height
    const titleY = pageHeight * 0.4;
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#000000');
    doc.text(content.title, MARGIN, titleY, {
      width: textWidth,
      align: 'center',
    });

    // Subtitle
    if (content.subtitle) {
      doc.moveDown(0.5);
      doc.fontSize(16).font('Helvetica').fillColor(MUTED_HEX);
      doc.text(content.subtitle, {
        width: textWidth,
        align: 'center',
      });
    }

    // Author + date at 70% height
    const metaY = pageHeight * 0.7;
    doc.fontSize(12).font('Helvetica').fillColor(MUTED_HEX);

    if (content.author) {
      doc.text(content.author, MARGIN, metaY, {
        width: textWidth,
        align: 'center',
      });
    }

    if (content.date) {
      doc.moveDown(0.3);
      doc.text(content.date, {
        width: textWidth,
        align: 'center',
      });
    }
  }

  // -----------------------------------------------------------------------
  // Private — Section rendering
  // -----------------------------------------------------------------------

  /**
   * Render a single {@link DocumentSection}, dispatching to the appropriate
   * sub-renderer for each content type present in the section.
   *
   * @param doc            - The active PDFDocument.
   * @param section        - The section to render.
   * @param documentTitle  - The overall document title (for headers).
   * @param showPageNumbers - Whether page numbers should be shown.
   */
  private async renderSection(
    doc: PDFKit.PDFDocument,
    section: DocumentSection,
    documentTitle: string,
    showPageNumbers: boolean,
  ): Promise<void> {
    // ---- Heading ----
    if (section.heading) {
      this.ensureSpace(doc, 40);
      const level = section.level ?? 1;
      const fontSize = HEADING_FONT_SIZES[level] ?? 14;

      // Spacing above heading (more for level 1)
      if (level === 1) {
        doc.moveDown(1.5);
      } else {
        doc.moveDown(1);
      }

      doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#000000');
      doc.text(section.heading, { width: this.contentWidth(doc) });
      doc.moveDown(0.5);
    }

    // ---- Paragraphs ----
    if (section.paragraphs) {
      for (const paragraph of section.paragraphs) {
        this.ensureSpace(doc, 30);
        this.renderMarkdownParagraph(doc, paragraph);
        doc.moveDown(0.6);
      }
    }

    // ---- Table ----
    if (section.table) {
      this.ensureSpace(doc, 60);
      this.renderTable(doc, section.table);
      doc.moveDown(1);
    }

    // ---- Chart ----
    if (section.chart) {
      this.ensureSpace(doc, 60);
      const { description, tableData } = this.chartRenderer.renderChart(section.chart);

      // Chart title heading
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
      doc.text(`Chart: ${section.chart.title ?? 'Untitled'}`, {
        width: this.contentWidth(doc),
      });
      doc.moveDown(0.3);

      // Description
      doc.fontSize(9).font('Helvetica').fillColor(MUTED_HEX);
      doc.text(description, { width: this.contentWidth(doc) });
      doc.moveDown(0.5);

      // Render chart data as a table
      this.renderTable(doc, tableData);
      doc.moveDown(1);
    }

    // ---- Image ----
    if (section.image) {
      await this.renderImage(doc, section.image);
      doc.moveDown(1);
    }

    // ---- List ----
    if (section.list) {
      this.ensureSpace(doc, 30);
      this.renderList(doc, section.list.items, section.list.ordered ?? false);
      doc.moveDown(0.8);
    }

    // ---- Key-values ----
    if (section.keyValues && section.keyValues.length > 0) {
      this.ensureSpace(doc, 40);
      this.renderKeyValues(doc, section.keyValues);
      doc.moveDown(0.8);
    }
  }

  // -----------------------------------------------------------------------
  // Private — Markdown paragraph rendering
  // -----------------------------------------------------------------------

  /**
   * Render a paragraph with basic inline Markdown formatting.
   *
   * Supported patterns:
   * - `**bold text**` — rendered in Helvetica-Bold
   * - `*italic text*` — rendered in Helvetica-Oblique
   * - `[link text](url)` — rendered in blue, underlined, as a clickable link
   * - Plain text — rendered in Helvetica
   *
   * The parser splits the paragraph into segments and uses pdfkit's
   * `continued` option to chain them on the same line flow.
   *
   * @param doc       - The active PDFDocument.
   * @param paragraph - The raw paragraph string with optional Markdown.
   */
  private renderMarkdownParagraph(doc: PDFKit.PDFDocument, paragraph: string): void {
    doc.fontSize(BODY_FONT_SIZE).fillColor('#000000');

    // Regex to match **bold**, *italic*, and [text](url) patterns.
    // Order matters: **bold** must be tried before *italic*.
    const segmentRegex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(\[([^\]]+)\]\(([^)]+)\))/g;

    let lastIndex = 0;
    const segments: Array<{
      text: string;
      font: string;
      color: string;
      link?: string;
      underline?: boolean;
    }> = [];

    let match: RegExpExecArray | null;
    while ((match = segmentRegex.exec(paragraph)) !== null) {
      // Push any plain text before this match
      if (match.index > lastIndex) {
        segments.push({
          text: paragraph.slice(lastIndex, match.index),
          font: 'Helvetica',
          color: '#000000',
        });
      }

      if (match[1]) {
        // **bold**
        segments.push({
          text: match[2]!,
          font: 'Helvetica-Bold',
          color: '#000000',
        });
      } else if (match[3]) {
        // *italic*
        segments.push({
          text: match[4]!,
          font: 'Helvetica-Oblique',
          color: '#000000',
        });
      } else if (match[5]) {
        // [text](url)
        segments.push({
          text: match[6]!,
          font: 'Helvetica',
          color: ACCENT_HEX,
          link: match[7]!,
          underline: true,
        });
      }

      lastIndex = match.index + match[0].length;
    }

    // Trailing plain text
    if (lastIndex < paragraph.length) {
      segments.push({
        text: paragraph.slice(lastIndex),
        font: 'Helvetica',
        color: '#000000',
      });
    }

    // If no Markdown was found, render as simple text
    if (segments.length === 0) {
      doc.font('Helvetica').text(paragraph, { width: this.contentWidth(doc) });
      return;
    }

    // Render segments using `continued` to keep them in the same text flow
    const width = this.contentWidth(doc);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const isLast = i === segments.length - 1;

      doc.font(seg.font).fillColor(seg.color);

      const textOptions: PDFKit.Mixins.TextOptions = {
        width,
        continued: !isLast,
        underline: seg.underline ?? false,
      };

      if (seg.link) {
        textOptions.link = seg.link;
      }

      doc.text(seg.text, textOptions);
    }
  }

  // -----------------------------------------------------------------------
  // Private — Table rendering
  // -----------------------------------------------------------------------

  /**
   * Render a {@link TableData} as a styled table with:
   * - Accent-coloured header row with white bold text
   * - Alternating light-grey and white data row stripes
   * - Automatic column width calculation (equal division)
   * - Page-break handling with repeated headers on new pages
   *
   * pdfkit has no built-in table API, so each cell is drawn manually
   * as a filled rectangle with positioned text inside it.
   *
   * @param doc   - The active PDFDocument.
   * @param table - The table data to render.
   */
  private renderTable(doc: PDFKit.PDFDocument, table: TableData): void {
    const availableWidth = this.contentWidth(doc);
    const columnCount = table.headers.length;
    if (columnCount === 0) return;

    // Calculate column widths — use provided widths or divide equally
    const colWidths: number[] = table.columnWidths
      ? this.normaliseColumnWidths(table.columnWidths, availableWidth)
      : Array(columnCount).fill(availableWidth / columnCount);

    const rowHeight = BODY_FONT_SIZE + CELL_PADDING_Y * 2 + 4;
    const startX = MARGIN;

    /**
     * Draw a single row (header or data) at the current vertical position.
     *
     * @param cells      - Array of cell text values.
     * @param isHeader   - Whether this is the header row (accent background).
     * @param rowIndex   - Zero-based data row index (for stripe alternation).
     */
    const drawRow = (cells: string[], isHeader: boolean, rowIndex: number): void => {
      const y = doc.y;
      let x = startX;

      for (let colIdx = 0; colIdx < columnCount; colIdx++) {
        const colW = colWidths[colIdx]!;
        const cellText = cells[colIdx] ?? '';

        // Background fill
        doc.save();
        if (isHeader) {
          doc.rect(x, y, colW, rowHeight).fill(ACCENT_HEX);
        } else if (rowIndex % 2 === 1) {
          doc.rect(x, y, colW, rowHeight).fill(STRIPE_HEX);
        } else {
          doc.rect(x, y, colW, rowHeight).fill('#ffffff');
        }
        doc.restore();

        // Cell text
        doc.save();
        if (isHeader) {
          doc.font('Helvetica-Bold').fontSize(BODY_FONT_SIZE).fillColor('#ffffff');
        } else {
          doc.font('Helvetica').fontSize(BODY_FONT_SIZE).fillColor('#000000');
        }

        doc.text(cellText, x + CELL_PADDING_X, y + CELL_PADDING_Y, {
          width: colW - CELL_PADDING_X * 2,
          height: rowHeight - CELL_PADDING_Y,
          ellipsis: true,
          lineBreak: false,
        });
        doc.restore();

        x += colW;
      }

      // Move doc.y past this row
      doc.y = y + rowHeight;
    };

    // ---- Draw header row ----
    drawRow(table.headers, true, -1);

    // ---- Draw data rows ----
    for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
      // Check for page overflow before drawing the row
      if (doc.y + rowHeight > doc.page.height - MARGIN) {
        doc.addPage();
        // Repeat header on the new page
        drawRow(table.headers, true, -1);
      }

      drawRow(table.rows[rowIdx]!, false, rowIdx);
    }
  }

  /**
   * Normalise user-provided column width hints to fill the available
   * page width proportionally. If the hints sum to less or more than
   * the available width, they are scaled proportionally.
   *
   * @param hints          - User-provided column width hints (in points).
   * @param availableWidth - Total available content width on the page.
   * @returns An array of scaled column widths that sum to `availableWidth`.
   */
  private normaliseColumnWidths(hints: number[], availableWidth: number): number[] {
    const total = hints.reduce((sum, w) => sum + w, 0);
    if (total <= 0) {
      return Array(hints.length).fill(availableWidth / hints.length);
    }
    const scale = availableWidth / total;
    return hints.map((w) => w * scale);
  }

  // -----------------------------------------------------------------------
  // Private — Image rendering
  // -----------------------------------------------------------------------

  /**
   * Render an {@link ImageSpec} by fetching from a URL or decoding base64.
   * The image is embedded with `doc.image()` using a `fit` constraint to
   * prevent overflow. An optional caption is rendered below in italic.
   *
   * On fetch failure the image is silently skipped with a console warning.
   *
   * @param doc   - The active PDFDocument.
   * @param image - The image specification.
   */
  private async renderImage(doc: PDFKit.PDFDocument, image: ImageSpec): Promise<void> {
    let imageBuffer: Buffer | null = null;

    if (image.base64) {
      // Strip data URI prefix if present
      const base64Data = image.base64.replace(/^data:image\/[^;]+;base64,/, '');
      try {
        imageBuffer = Buffer.from(base64Data, 'base64');
      } catch {
        console.warn('[PdfGenerator] Failed to decode base64 image — skipping.');
        return;
      }
    } else if (image.url) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

        const response = await fetch(image.url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`[PdfGenerator] Image fetch returned ${response.status} for ${image.url} — skipping.`);
          return;
        }

        const arrayBuf = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuf);
      } catch (err) {
        console.warn(`[PdfGenerator] Failed to fetch image from ${image.url} — skipping.`, err);
        return;
      }
    }

    if (!imageBuffer || imageBuffer.length === 0) return;

    this.ensureSpace(doc, 120);

    const maxWidth = image.width ?? this.contentWidth(doc) * 0.8;
    const maxHeight = doc.page.height - MARGIN * 2 - 60; // leave room for caption

    try {
      doc.image(imageBuffer, {
        fit: [maxWidth, maxHeight],
        align: 'center' as any,
        valign: 'center' as any,
      });
    } catch (err) {
      console.warn('[PdfGenerator] Failed to embed image in PDF — skipping.', err);
      return;
    }

    // Caption
    if (image.caption) {
      doc.moveDown(0.3);
      doc.fontSize(9).font('Helvetica-Oblique').fillColor(MUTED_HEX);
      doc.text(image.caption, { width: this.contentWidth(doc), align: 'center' });
    }
  }

  // -----------------------------------------------------------------------
  // Private — List rendering
  // -----------------------------------------------------------------------

  /**
   * Render a bulleted or numbered list with a 20pt left indent.
   *
   * @param doc     - The active PDFDocument.
   * @param items   - The list item strings.
   * @param ordered - If `true`, render as a numbered list; otherwise bullets.
   */
  private renderList(doc: PDFKit.PDFDocument, items: string[], ordered: boolean): void {
    const indent = 20;
    const width = this.contentWidth(doc) - indent;

    doc.fontSize(BODY_FONT_SIZE).font('Helvetica').fillColor('#000000');

    for (let i = 0; i < items.length; i++) {
      this.ensureSpace(doc, 20);
      const prefix = ordered ? `${i + 1}. ` : '\u2022 '; // bullet: •
      doc.text(`${prefix}${items[i]}`, MARGIN + indent, doc.y, { width });
    }
  }

  // -----------------------------------------------------------------------
  // Private — Key-value rendering
  // -----------------------------------------------------------------------

  /**
   * Render key-value pairs as a two-column mini-table. Keys are rendered
   * in bold, values in regular weight, using the table renderer for
   * consistent styling.
   *
   * @param doc       - The active PDFDocument.
   * @param keyValues - Array of key-value objects.
   */
  private renderKeyValues(
    doc: PDFKit.PDFDocument,
    keyValues: Array<{ key: string; value: string }>,
  ): void {
    const tableData: TableData = {
      headers: ['Key', 'Value'],
      rows: keyValues.map((kv) => [kv.key, kv.value]),
      columnWidths: [1, 2], // 1:2 ratio, normalised by renderTable
    };

    this.renderTable(doc, tableData);
  }

  // -----------------------------------------------------------------------
  // Private — Layout utilities
  // -----------------------------------------------------------------------

  /**
   * Calculate the usable content width on the current page (page width
   * minus left and right margins).
   *
   * @param doc - The active PDFDocument.
   * @returns Content width in points.
   */
  private contentWidth(doc: PDFKit.PDFDocument): number {
    return doc.page.width - MARGIN * 2;
  }

  /**
   * Ensure at least `requiredSpace` points of vertical space remain on the
   * current page. If not, add a new page. This prevents content from being
   * clipped at the bottom margin.
   *
   * @param doc           - The active PDFDocument.
   * @param requiredSpace - Minimum vertical space needed (in points).
   */
  private ensureSpace(doc: PDFKit.PDFDocument, requiredSpace: number): void {
    const remaining = doc.page.height - MARGIN - doc.y;
    if (remaining < Math.max(requiredSpace, PAGE_BREAK_THRESHOLD)) {
      doc.addPage();
    }
  }
}
