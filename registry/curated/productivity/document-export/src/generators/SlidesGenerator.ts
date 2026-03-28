/**
 * @module SlidesGenerator
 *
 * Generates themed PPTX presentations from structured {@link DocumentContent}
 * using the `pptxgenjs` library. Each document section maps to a single slide,
 * with layout auto-detection when no explicit layout hint is provided.
 *
 * Features:
 *
 * - **5 built-in themes** — dark, light, corporate, creative, minimal
 * - **7 slide layouts** — title, content, two-column, image-left, image-right,
 *   chart-full, comparison
 * - **Native charts** — bar, line, pie, doughnut, area, scatter via pptxgenjs
 * - **Embedded images** — URLs fetched and base64-encoded automatically
 * - **Tables** — styled header rows with theme accent colours
 * - **Speaker notes** — attached per-slide when provided
 * - **Slide numbers** — bottom-right with muted theme colour
 */

import PptxGenJS from 'pptxgenjs';

import type {
  ChartSpec,
  DocumentContent,
  DocumentSection,
  ExportOptions,
  ImageSpec,
  SlideTheme,
  TableData,
} from '../types.js';
import { getTheme } from '../themes/SlideThemes.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maps our {@link ChartSpec} type strings to pptxgenjs chart type names.
 * The pptxgenjs `CHART_NAME` type is a string union; we cast through it.
 */
const CHART_TYPE_MAP: Record<ChartSpec['type'], string> = {
  bar: 'bar',
  line: 'line',
  pie: 'pie',
  doughnut: 'doughnut',
  area: 'area',
  scatter: 'scatter',
};

/** Slide dimensions for LAYOUT_WIDE in inches. */
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;

/** Standard content margins (inches). */
const MARGIN_X = 0.7;
const MARGIN_Y = 0.5;
const CONTENT_W = SLIDE_W - MARGIN_X * 2;

/** Timeout in milliseconds for fetching remote images. */
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Helper: strip leading '#' from hex colours for pptxgenjs
// ---------------------------------------------------------------------------

/**
 * Convert a CSS hex colour (`#RRGGBB`) to a bare hex string (`RRGGBB`)
 * as required by pptxgenjs colour properties.
 *
 * @param hex - CSS hex colour string (with or without leading `#`).
 * @returns The bare 6-character hex string.
 */
function stripHash(hex: string): string {
  return hex.startsWith('#') ? hex.slice(1) : hex;
}

// ---------------------------------------------------------------------------
// SlidesGenerator
// ---------------------------------------------------------------------------

/**
 * Stateless PPTX generator that converts {@link DocumentContent} into a
 * themed PowerPoint presentation buffer.
 *
 * The generator follows a "one section = one slide" mapping. Each slide is
 * laid out according to the section's `layout` hint, or auto-detected from
 * the section's content (chart, image, table, etc.).
 *
 * @example
 * ```ts
 * const gen = new SlidesGenerator();
 * const buffer = await gen.generate({
 *   title: 'Q4 Report',
 *   theme: 'corporate',
 *   sections: [
 *     { heading: 'Revenue', chart: { type: 'bar', data: [...] } },
 *     { heading: 'Team', paragraphs: ['Our team grew by 40%.'] },
 *   ],
 * });
 * fs.writeFileSync('report.pptx', buffer);
 * ```
 */
export class SlidesGenerator {
  /**
   * Generate a PPTX buffer from the provided document content.
   *
   * Processing pipeline:
   *
   * 1. Instantiate `PptxGenJS` and configure layout, metadata, and the
   *    slide master derived from the selected theme.
   * 2. Optionally create a title / cover slide (unless `options.coverPage`
   *    is explicitly `false`).
   * 3. Iterate over every {@link DocumentSection}, auto-detect or honour
   *    the `layout` hint, and render the slide accordingly.
   * 4. Serialise the presentation to a Node.js `Buffer`.
   *
   * @param content - The structured document content to render.
   * @param options - Optional export configuration overrides.
   * @returns A Buffer containing the complete PPTX binary data.
   */
  async generate(content: DocumentContent, options?: ExportOptions): Promise<Buffer> {
    const pptx = new PptxGenJS();
    const theme = getTheme(content.theme);

    // ---- Presentation metadata ----
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = content.author ?? 'Document Export Extension';
    pptx.title = content.title;
    pptx.subject = content.subtitle ?? '';

    // ---- Define a slide master with the theme background ----
    pptx.defineSlideMaster({
      title: 'THEMED_MASTER',
      background: { color: stripHash(theme.background) },
    });

    // ---- Cover / title slide ----
    if (options?.coverPage !== false) {
      this.addCoverSlide(pptx, content, theme);
    }

    // ---- Content slides ----
    for (const section of content.sections) {
      // Skip completely empty sections
      if (!this.sectionHasContent(section)) {
        continue;
      }

      const layout = section.layout ?? this.detectLayout(section);
      const slide = pptx.addSlide({ masterName: 'THEMED_MASTER' });

      // Slide number
      slide.slideNumber = {
        x: '95%',
        y: '95%',
        fontSize: 8,
        color: stripHash(theme.mutedColor),
      };

      // Speaker notes
      if (section.speakerNotes) {
        slide.addNotes(section.speakerNotes);
      }

      switch (layout) {
        case 'title':
          this.renderTitleLayout(slide, section, theme);
          break;
        case 'two-column':
          this.renderTwoColumnLayout(slide, section, theme);
          break;
        case 'image-left':
          await this.renderImageLayout(slide, section, theme, 'left');
          break;
        case 'image-right':
          await this.renderImageLayout(slide, section, theme, 'right');
          break;
        case 'chart-full':
          this.renderChartFullLayout(slide, section, theme);
          break;
        case 'comparison':
          this.renderComparisonLayout(slide, section, theme);
          break;
        case 'content':
        default:
          await this.renderContentLayout(slide, section, theme);
          break;
      }
    }

    // ---- Write buffer ----
    const output = await pptx.write({ outputType: 'nodebuffer' });
    return Buffer.from(output as ArrayBuffer);
  }

  // -----------------------------------------------------------------------
  // Cover slide
  // -----------------------------------------------------------------------

  /**
   * Create a title / cover slide with the document title, subtitle, and
   * date centred on the slide background.
   *
   * @param pptx    - The PptxGenJS presentation instance.
   * @param content - The document content (title, subtitle, date, author).
   * @param theme   - The active slide theme.
   */
  private addCoverSlide(pptx: PptxGenJS, content: DocumentContent, theme: SlideTheme): void {
    const slide = pptx.addSlide({ masterName: 'THEMED_MASTER' });

    // Large centred title
    slide.addText(content.title, {
      x: MARGIN_X,
      y: '30%',
      w: CONTENT_W,
      h: 1.5,
      fontSize: 36,
      bold: true,
      color: stripHash(theme.titleColor),
      fontFace: theme.titleFont,
      align: 'center',
      valign: 'middle',
    });

    // Subtitle
    if (content.subtitle) {
      slide.addText(content.subtitle, {
        x: MARGIN_X,
        y: '52%',
        w: CONTENT_W,
        h: 0.8,
        fontSize: 20,
        color: stripHash(theme.mutedColor),
        fontFace: theme.bodyFont,
        align: 'center',
        valign: 'top',
      });
    }

    // Date at bottom
    const dateStr = content.date ?? new Date().toISOString().slice(0, 10);
    slide.addText(dateStr, {
      x: MARGIN_X,
      y: '80%',
      w: CONTENT_W,
      h: 0.5,
      fontSize: 12,
      color: stripHash(theme.mutedColor),
      fontFace: theme.bodyFont,
      align: 'center',
      valign: 'middle',
    });
  }

  // -----------------------------------------------------------------------
  // Layout: title
  // -----------------------------------------------------------------------

  /**
   * Render a "title" layout — large centred heading with optional subtitle
   * text from the first paragraph.
   *
   * @param slide   - The target pptxgenjs Slide.
   * @param section - The document section to render.
   * @param theme   - The active slide theme.
   */
  private renderTitleLayout(
    slide: PptxGenJS.Slide,
    section: DocumentSection,
    theme: SlideTheme,
  ): void {
    if (section.heading) {
      slide.addText(section.heading, {
        x: MARGIN_X,
        y: '30%',
        w: CONTENT_W,
        h: 1.5,
        fontSize: 36,
        bold: true,
        color: stripHash(theme.titleColor),
        fontFace: theme.titleFont,
        align: 'center',
        valign: 'middle',
      });
    }

    // Use first paragraph as subtitle text
    if (section.paragraphs && section.paragraphs.length > 0) {
      slide.addText(section.paragraphs[0], {
        x: MARGIN_X,
        y: '55%',
        w: CONTENT_W,
        h: 0.8,
        fontSize: 20,
        color: stripHash(theme.mutedColor),
        fontFace: theme.bodyFont,
        align: 'center',
        valign: 'top',
      });
    }
  }

  // -----------------------------------------------------------------------
  // Layout: content (default)
  // -----------------------------------------------------------------------

  /**
   * Render the default "content" layout — heading at the top with body
   * content (paragraphs, lists, key-values, tables, charts, images) below.
   *
   * @param slide   - The target pptxgenjs Slide.
   * @param section - The document section to render.
   * @param theme   - The active slide theme.
   */
  private async renderContentLayout(
    slide: PptxGenJS.Slide,
    section: DocumentSection,
    theme: SlideTheme,
  ): Promise<void> {
    let currentY = MARGIN_Y;

    // ---- Heading ----
    if (section.heading) {
      const headingSize = section.level === 1 ? 28 : section.level === 3 ? 20 : 24;
      slide.addText(section.heading, {
        x: MARGIN_X,
        y: currentY,
        w: CONTENT_W,
        h: 0.7,
        fontSize: headingSize,
        bold: true,
        color: stripHash(theme.titleColor),
        fontFace: theme.titleFont,
        valign: 'bottom',
      });
      currentY += 0.85;
    }

    // ---- Paragraphs ----
    if (section.paragraphs && section.paragraphs.length > 0) {
      const bodyText = this.buildParagraphTextProps(section.paragraphs, theme);
      slide.addText(bodyText, {
        x: MARGIN_X,
        y: currentY,
        w: CONTENT_W,
        h: this.estimateTextHeight(section.paragraphs),
        fontSize: 16,
        color: stripHash(theme.textColor),
        fontFace: theme.bodyFont,
        valign: 'top',
        paraSpaceAfter: 8,
      });
      currentY += this.estimateTextHeight(section.paragraphs) + 0.15;
    }

    // ---- List ----
    if (section.list && section.list.items.length > 0) {
      currentY = this.addList(slide, section.list, currentY, theme, MARGIN_X, CONTENT_W);
    }

    // ---- Key-values ----
    if (section.keyValues && section.keyValues.length > 0) {
      currentY = this.addKeyValues(slide, section.keyValues, currentY, theme, MARGIN_X, CONTENT_W);
    }

    // ---- Table ----
    if (section.table) {
      this.addTable(slide, section.table, currentY, theme, MARGIN_X, CONTENT_W);
    }

    // ---- Chart ----
    if (section.chart) {
      this.addChart(slide, section.chart, currentY, theme, MARGIN_X, CONTENT_W);
    }

    // ---- Image ----
    if (section.image) {
      await this.addImage(slide, section.image, currentY, MARGIN_X, CONTENT_W);
    }
  }

  // -----------------------------------------------------------------------
  // Layout: two-column
  // -----------------------------------------------------------------------

  /**
   * Render a "two-column" layout — content split at 50% width. Paragraphs
   * are distributed evenly across the two columns; if there is only one
   * paragraph it occupies the left column.
   *
   * @param slide   - The target pptxgenjs Slide.
   * @param section - The document section to render.
   * @param theme   - The active slide theme.
   */
  private renderTwoColumnLayout(
    slide: PptxGenJS.Slide,
    section: DocumentSection,
    theme: SlideTheme,
  ): void {
    let currentY = MARGIN_Y;

    // ---- Heading (full width) ----
    if (section.heading) {
      slide.addText(section.heading, {
        x: MARGIN_X,
        y: currentY,
        w: CONTENT_W,
        h: 0.7,
        fontSize: 24,
        bold: true,
        color: stripHash(theme.titleColor),
        fontFace: theme.titleFont,
        valign: 'bottom',
      });
      currentY += 0.85;
    }

    const colW = (CONTENT_W - 0.4) / 2; // 0.4" gutter
    const leftX = MARGIN_X;
    const rightX = MARGIN_X + colW + 0.4;

    // Split paragraphs between columns
    const allParagraphs = section.paragraphs ?? [];
    const midpoint = Math.ceil(allParagraphs.length / 2);
    const leftParagraphs = allParagraphs.slice(0, midpoint);
    const rightParagraphs = allParagraphs.slice(midpoint);

    if (leftParagraphs.length > 0) {
      const bodyText = this.buildParagraphTextProps(leftParagraphs, theme);
      slide.addText(bodyText, {
        x: leftX,
        y: currentY,
        w: colW,
        h: SLIDE_H - currentY - 0.8,
        fontSize: 14,
        color: stripHash(theme.textColor),
        fontFace: theme.bodyFont,
        valign: 'top',
        paraSpaceAfter: 6,
      });
    }

    if (rightParagraphs.length > 0) {
      const bodyText = this.buildParagraphTextProps(rightParagraphs, theme);
      slide.addText(bodyText, {
        x: rightX,
        y: currentY,
        w: colW,
        h: SLIDE_H - currentY - 0.8,
        fontSize: 14,
        color: stripHash(theme.textColor),
        fontFace: theme.bodyFont,
        valign: 'top',
        paraSpaceAfter: 6,
      });
    }

    // Lists go into the right column if no right paragraphs
    if (section.list && section.list.items.length > 0 && rightParagraphs.length === 0) {
      this.addList(slide, section.list, currentY, theme, rightX, colW);
    }
  }

  // -----------------------------------------------------------------------
  // Layout: image-left / image-right
  // -----------------------------------------------------------------------

  /**
   * Render an image layout — image on one side (40% width), text on the
   * other (55% width) with a gutter between them.
   *
   * @param slide   - The target pptxgenjs Slide.
   * @param section - The document section to render.
   * @param theme   - The active slide theme.
   * @param side    - Which side the image appears on ('left' or 'right').
   */
  private async renderImageLayout(
    slide: PptxGenJS.Slide,
    section: DocumentSection,
    theme: SlideTheme,
    side: 'left' | 'right',
  ): Promise<void> {
    let currentY = MARGIN_Y;

    // ---- Heading (full width) ----
    if (section.heading) {
      slide.addText(section.heading, {
        x: MARGIN_X,
        y: currentY,
        w: CONTENT_W,
        h: 0.7,
        fontSize: 24,
        bold: true,
        color: stripHash(theme.titleColor),
        fontFace: theme.titleFont,
        valign: 'bottom',
      });
      currentY += 0.85;
    }

    const imageW = CONTENT_W * 0.4;
    const textW = CONTENT_W * 0.55;
    const gutter = CONTENT_W * 0.05;

    const imageX = side === 'left' ? MARGIN_X : MARGIN_X + textW + gutter;
    const textX = side === 'left' ? MARGIN_X + imageW + gutter : MARGIN_X;

    // ---- Image ----
    if (section.image) {
      const imgH = SLIDE_H - currentY - 0.8;
      await this.addImage(slide, section.image, currentY, imageX, imageW, imgH);
    }

    // ---- Text ----
    if (section.paragraphs && section.paragraphs.length > 0) {
      const bodyText = this.buildParagraphTextProps(section.paragraphs, theme);
      slide.addText(bodyText, {
        x: textX,
        y: currentY,
        w: textW,
        h: SLIDE_H - currentY - 0.8,
        fontSize: 14,
        color: stripHash(theme.textColor),
        fontFace: theme.bodyFont,
        valign: 'top',
        paraSpaceAfter: 6,
      });
    }

    // ---- List ----
    if (section.list && section.list.items.length > 0) {
      const listY = section.paragraphs
        ? currentY + this.estimateTextHeight(section.paragraphs) + 0.1
        : currentY;
      this.addList(slide, section.list, listY, theme, textX, textW);
    }
  }

  // -----------------------------------------------------------------------
  // Layout: chart-full
  // -----------------------------------------------------------------------

  /**
   * Render a "chart-full" layout — heading at top and a full-width chart
   * occupying the remaining slide area.
   *
   * @param slide   - The target pptxgenjs Slide.
   * @param section - The document section to render.
   * @param theme   - The active slide theme.
   */
  private renderChartFullLayout(
    slide: PptxGenJS.Slide,
    section: DocumentSection,
    theme: SlideTheme,
  ): void {
    let currentY = MARGIN_Y;

    if (section.heading) {
      slide.addText(section.heading, {
        x: MARGIN_X,
        y: currentY,
        w: CONTENT_W,
        h: 0.7,
        fontSize: 24,
        bold: true,
        color: stripHash(theme.titleColor),
        fontFace: theme.titleFont,
        valign: 'bottom',
      });
      currentY += 0.85;
    }

    if (section.chart) {
      const chartH = SLIDE_H - currentY - 0.5;
      this.addChart(slide, section.chart, currentY, theme, MARGIN_X, CONTENT_W, chartH);
    }
  }

  // -----------------------------------------------------------------------
  // Layout: comparison
  // -----------------------------------------------------------------------

  /**
   * Render a "comparison" layout — two side-by-side columns, each with
   * a sub-heading. Paragraphs are split evenly; odd paragraphs go to
   * the left column.
   *
   * @param slide   - The target pptxgenjs Slide.
   * @param section - The document section to render.
   * @param theme   - The active slide theme.
   */
  private renderComparisonLayout(
    slide: PptxGenJS.Slide,
    section: DocumentSection,
    theme: SlideTheme,
  ): void {
    let currentY = MARGIN_Y;

    // ---- Main heading (full width) ----
    if (section.heading) {
      slide.addText(section.heading, {
        x: MARGIN_X,
        y: currentY,
        w: CONTENT_W,
        h: 0.7,
        fontSize: 24,
        bold: true,
        color: stripHash(theme.titleColor),
        fontFace: theme.titleFont,
        valign: 'bottom',
      });
      currentY += 0.85;
    }

    const colW = (CONTENT_W - 0.5) / 2;
    const leftX = MARGIN_X;
    const rightX = MARGIN_X + colW + 0.5;

    // ---- Accent divider line (thin vertical bar in the centre) ----
    slide.addShape('rect' as PptxGenJS.ShapeType, {
      x: MARGIN_X + colW + 0.2,
      y: currentY,
      w: 0.04,
      h: SLIDE_H - currentY - 0.8,
      fill: { color: stripHash(theme.accentColor) },
    });

    // Split paragraphs
    const allParagraphs = section.paragraphs ?? [];
    const midpoint = Math.ceil(allParagraphs.length / 2);
    const leftParagraphs = allParagraphs.slice(0, midpoint);
    const rightParagraphs = allParagraphs.slice(midpoint);

    // Left sub-heading (use first paragraph as heading if short)
    const leftSubHead = leftParagraphs.length > 0 ? leftParagraphs[0] : 'Option A';
    slide.addText(leftSubHead, {
      x: leftX,
      y: currentY,
      w: colW,
      h: 0.5,
      fontSize: 18,
      bold: true,
      color: stripHash(theme.accentColor),
      fontFace: theme.titleFont,
      valign: 'bottom',
    });

    // Right sub-heading
    const rightSubHead = rightParagraphs.length > 0 ? rightParagraphs[0] : 'Option B';
    slide.addText(rightSubHead, {
      x: rightX,
      y: currentY,
      w: colW,
      h: 0.5,
      fontSize: 18,
      bold: true,
      color: stripHash(theme.accentColor),
      fontFace: theme.titleFont,
      valign: 'bottom',
    });

    const bodyY = currentY + 0.65;

    // Left body content
    if (leftParagraphs.length > 1) {
      const bodyText = this.buildParagraphTextProps(leftParagraphs.slice(1), theme);
      slide.addText(bodyText, {
        x: leftX,
        y: bodyY,
        w: colW,
        h: SLIDE_H - bodyY - 0.8,
        fontSize: 13,
        color: stripHash(theme.textColor),
        fontFace: theme.bodyFont,
        valign: 'top',
        paraSpaceAfter: 6,
      });
    }

    // Right body content
    if (rightParagraphs.length > 1) {
      const bodyText = this.buildParagraphTextProps(rightParagraphs.slice(1), theme);
      slide.addText(bodyText, {
        x: rightX,
        y: bodyY,
        w: colW,
        h: SLIDE_H - bodyY - 0.8,
        fontSize: 13,
        color: stripHash(theme.textColor),
        fontFace: theme.bodyFont,
        valign: 'top',
        paraSpaceAfter: 6,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Content primitives
  // -----------------------------------------------------------------------

  /**
   * Add a bulleted or numbered list to the slide.
   *
   * @param slide   - The target pptxgenjs Slide.
   * @param list    - The list items and ordering flag.
   * @param y       - Vertical offset (inches) for the list.
   * @param theme   - The active slide theme.
   * @param x       - Horizontal offset (inches).
   * @param w       - Available width (inches).
   * @returns The new vertical offset after the list.
   */
  private addList(
    slide: PptxGenJS.Slide,
    list: NonNullable<DocumentSection['list']>,
    y: number,
    theme: SlideTheme,
    x: number,
    w: number,
  ): number {
    const textProps: PptxGenJS.TextProps[] = list.items.map((item, idx) => ({
      text: item,
      options: {
        bullet: list.ordered ? { type: 'number' as const, startAt: idx + 1 } : true,
        fontSize: 14,
        color: stripHash(theme.textColor),
        fontFace: theme.bodyFont,
        breakLine: true,
        paraSpaceBefore: 4,
        paraSpaceAfter: 4,
      },
    }));

    const h = Math.min(list.items.length * 0.35, SLIDE_H - y - 0.8);

    slide.addText(textProps, {
      x,
      y,
      w,
      h,
      valign: 'top',
    });

    return y + h + 0.15;
  }

  /**
   * Add key-value pairs as a two-column mini-table on the slide.
   *
   * @param slide     - The target pptxgenjs Slide.
   * @param keyValues - The key-value pair array.
   * @param y         - Vertical offset (inches).
   * @param theme     - The active slide theme.
   * @param x         - Horizontal offset (inches).
   * @param w         - Available width (inches).
   * @returns The new vertical offset after the key-value block.
   */
  private addKeyValues(
    slide: PptxGenJS.Slide,
    keyValues: NonNullable<DocumentSection['keyValues']>,
    y: number,
    theme: SlideTheme,
    x: number,
    w: number,
  ): number {
    const rows: PptxGenJS.TableRow[] = keyValues.map((kv) => [
      {
        text: kv.key,
        options: {
          bold: true,
          fontSize: 13,
          color: stripHash(theme.titleColor),
          fontFace: theme.bodyFont,
          fill: { color: stripHash(theme.background) },
        },
      },
      {
        text: kv.value,
        options: {
          fontSize: 13,
          color: stripHash(theme.textColor),
          fontFace: theme.bodyFont,
          fill: { color: stripHash(theme.background) },
        },
      },
    ]);

    const h = Math.min(keyValues.length * 0.4, SLIDE_H - y - 0.8);
    const keyColW = w * 0.35;
    const valColW = w * 0.65;

    slide.addTable(rows, {
      x,
      y,
      w,
      h,
      colW: [keyColW, valColW],
      border: { type: 'solid', pt: 0.5, color: stripHash(theme.mutedColor) },
      fontSize: 13,
      fontFace: theme.bodyFont,
    });

    return y + h + 0.15;
  }

  /**
   * Add a formatted data table to the slide with a styled header row.
   *
   * @param slide - The target pptxgenjs Slide.
   * @param table - The table data (headers + rows).
   * @param y     - Vertical offset (inches).
   * @param theme - The active slide theme.
   * @param x     - Horizontal offset (inches).
   * @param w     - Available width (inches).
   */
  private addTable(
    slide: PptxGenJS.Slide,
    table: TableData,
    y: number,
    theme: SlideTheme,
    x: number,
    w: number,
  ): void {
    // Header row
    const headerRow: PptxGenJS.TableRow = table.headers.map((h) => ({
      text: h,
      options: {
        bold: true,
        fontSize: 12,
        color: 'FFFFFF',
        fontFace: theme.bodyFont,
        fill: { color: stripHash(theme.accentColor) },
        align: 'center' as const,
        valign: 'middle' as const,
      },
    }));

    // Data rows
    const dataRows: PptxGenJS.TableRow[] = table.rows.map((row) =>
      row.map((cell) => ({
        text: cell,
        options: {
          fontSize: 11,
          color: stripHash(theme.textColor),
          fontFace: theme.bodyFont,
          fill: { color: stripHash(theme.background) },
          valign: 'middle' as const,
        },
      })),
    );

    const allRows = [headerRow, ...dataRows];
    const colCount = table.headers.length;
    const colW = w / colCount;
    const tableH = Math.min(allRows.length * 0.35, SLIDE_H - y - 0.5);

    slide.addTable(allRows, {
      x,
      y,
      w,
      h: tableH,
      colW: table.columnWidths?.map((cw) => cw / 72) ?? Array(colCount).fill(colW),
      border: { type: 'solid', pt: 0.5, color: stripHash(theme.mutedColor) },
      autoPage: true,
    });
  }

  /**
   * Add a native pptxgenjs chart to the slide.
   *
   * Maps our {@link ChartSpec} data model to the pptxgenjs `OptsChartData[]`
   * format and applies theme chart palette colours.
   *
   * @param slide     - The target pptxgenjs Slide.
   * @param chartSpec - The chart specification from the document section.
   * @param y         - Vertical offset (inches).
   * @param theme     - The active slide theme.
   * @param x         - Horizontal offset (inches).
   * @param w         - Available width (inches).
   * @param h         - Optional explicit chart height (inches).
   */
  private addChart(
    slide: PptxGenJS.Slide,
    chartSpec: ChartSpec,
    y: number,
    theme: SlideTheme,
    x: number,
    w: number,
    h?: number,
  ): void {
    const chartType = CHART_TYPE_MAP[chartSpec.type] as PptxGenJS.CHART_NAME;
    const chartH = h ?? Math.min(4.0, SLIDE_H - y - 0.5);

    // Build pptxgenjs data series from our ChartDataSet[]
    const chartData: PptxGenJS.OptsChartData[] = chartSpec.data.map((ds) => ({
      name: ds.label,
      labels: ds.categories ?? ds.values.map((_, i) => String(i + 1)),
      values: ds.values,
    }));

    // Chart colours from theme palette
    const chartColors = chartSpec.data.map((ds, i) =>
      stripHash(ds.color ?? theme.chartPalette[i % theme.chartPalette.length]),
    );

    const chartOpts: PptxGenJS.IChartOpts = {
      x,
      y,
      w,
      h: chartH,
      chartColors,
      showTitle: !!chartSpec.title,
      title: chartSpec.title,
      titleColor: stripHash(theme.titleColor),
      titleFontFace: theme.titleFont,
      titleFontSize: 14,
      showLegend: chartSpec.data.length > 1,
      legendFontSize: 10,
      legendColor: stripHash(theme.textColor),
    };

    // Axis labels (not applicable to pie / doughnut)
    if (chartSpec.type !== 'pie' && chartSpec.type !== 'doughnut') {
      if (chartSpec.xAxisLabel) {
        chartOpts.catAxisTitle = chartSpec.xAxisLabel;
        chartOpts.catAxisTitleColor = stripHash(theme.textColor);
        chartOpts.catAxisTitleFontSize = 10;
      }

      if (chartSpec.yAxisLabel) {
        chartOpts.valAxisTitle = chartSpec.yAxisLabel;
        chartOpts.valAxisTitleColor = stripHash(theme.textColor);
        chartOpts.valAxisTitleFontSize = 10;
      }
    }

    slide.addChart(chartType, chartData, chartOpts);
  }

  /**
   * Add an image to the slide, handling both base64 and URL sources.
   *
   * For URL-sourced images the method fetches the image data, converts it
   * to base64, and embeds it inline. A 10-second timeout is enforced on
   * the fetch to avoid hanging the generation pipeline.
   *
   * @param slide    - The target pptxgenjs Slide.
   * @param imageSpec - The image specification (url or base64).
   * @param y         - Vertical offset (inches).
   * @param x         - Horizontal offset (inches).
   * @param w         - Available width (inches).
   * @param h         - Optional explicit height (inches).
   */
  private async addImage(
    slide: PptxGenJS.Slide,
    imageSpec: ImageSpec,
    y: number,
    x: number,
    w: number,
    h?: number,
  ): Promise<void> {
    const imageH = h ?? Math.min(3.5, SLIDE_H - y - 1.0);
    const imageW = imageSpec.width ?? w;

    let imageData: string | undefined;
    let imagePath: string | undefined;

    if (imageSpec.base64) {
      // Strip the "data:image/xxx;base64," prefix if present — pptxgenjs
      // expects it to be included in the `data` property.
      imageData = imageSpec.base64;
    } else if (imageSpec.url) {
      // Fetch remote image and convert to base64
      try {
        const fetchedData = await this.fetchImageAsBase64(imageSpec.url);
        if (fetchedData) {
          imageData = fetchedData;
        } else {
          // Fallback: pass URL as path (works if pptxgenjs can resolve it)
          imagePath = imageSpec.url;
        }
      } catch {
        // Silently skip images that cannot be fetched
        return;
      }
    } else {
      // No image source provided
      return;
    }

    const imageProps: PptxGenJS.ImageProps = {
      x,
      y,
      w: Math.min(imageW, w),
      h: imageH,
      sizing: { type: 'contain', w: Math.min(imageW, w), h: imageH },
    };

    if (imageData) {
      imageProps.data = imageData;
    } else if (imagePath) {
      imageProps.path = imagePath;
    }

    slide.addImage(imageProps);

    // Caption below image
    if (imageSpec.caption) {
      slide.addText(imageSpec.caption, {
        x,
        y: y + imageH + 0.05,
        w,
        h: 0.3,
        fontSize: 10,
        italic: true,
        color: stripHash(getTheme().mutedColor),
        align: 'center',
      });
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Detect the best layout for a section based on its content. Sections
   * with a chart get "chart-full", sections with an image and paragraphs
   * get "image-right", sections with only a table get "content", and
   * everything else defaults to "content".
   *
   * @param section - The document section to analyse.
   * @returns The detected layout name.
   */
  private detectLayout(section: DocumentSection): NonNullable<DocumentSection['layout']> {
    if (section.chart) return 'chart-full';
    if (section.image && section.paragraphs && section.paragraphs.length > 0) return 'image-right';
    return 'content';
  }

  /**
   * Check whether a section has any renderable content at all. Empty
   * sections (no heading, paragraphs, table, chart, image, list, or
   * key-values) are skipped.
   *
   * @param section - The document section to test.
   * @returns `true` if the section contains at least one content element.
   */
  private sectionHasContent(section: DocumentSection): boolean {
    return !!(
      section.heading ||
      (section.paragraphs && section.paragraphs.length > 0) ||
      section.table ||
      section.chart ||
      section.image ||
      (section.list && section.list.items.length > 0) ||
      (section.keyValues && section.keyValues.length > 0)
    );
  }

  /**
   * Build an array of pptxgenjs `TextProps` from paragraph strings.
   * Each paragraph becomes a separate text run with a line break.
   *
   * @param paragraphs - The paragraph strings.
   * @param theme      - The active slide theme (for colour and font).
   * @returns An array of `TextProps` objects.
   */
  private buildParagraphTextProps(
    paragraphs: string[],
    theme: SlideTheme,
  ): PptxGenJS.TextProps[] {
    return paragraphs.map((p) => ({
      text: p,
      options: {
        fontSize: 14,
        color: stripHash(theme.textColor),
        fontFace: theme.bodyFont,
        breakLine: true,
        paraSpaceAfter: 8,
      },
    }));
  }

  /**
   * Estimate the vertical height (in inches) needed to display a set
   * of paragraph strings on a slide. Uses a rough heuristic of ~0.35"
   * per paragraph capped at the usable slide height.
   *
   * @param paragraphs - The paragraph strings.
   * @returns Estimated height in inches.
   */
  private estimateTextHeight(paragraphs: string[]): number {
    const baseHeight = paragraphs.length * 0.35;
    // Account for long paragraphs that may wrap
    const wrapExtra = paragraphs.reduce((acc, p) => acc + Math.floor(p.length / 120) * 0.2, 0);
    return Math.min(baseHeight + wrapExtra, 5.0);
  }

  /**
   * Fetch a remote image by URL and return it as a base64-encoded data URI
   * string. Returns `null` if the fetch fails or times out.
   *
   * @param url - The image URL to fetch.
   * @returns A base64 data URI string, or `null` on failure.
   */
  private async fetchImageAsBase64(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'image/*' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get('content-type') ?? 'image/png';
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      return `${contentType};base64,${base64}`;
    } catch {
      return null;
    }
  }
}
