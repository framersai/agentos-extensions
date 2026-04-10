// @ts-nocheck
/**
 * @module DocxGenerator
 *
 * Generates a styled Microsoft Word (DOCX) document from structured
 * {@link DocumentContent} using the `docx` npm package (v9.x declarative
 * API). The output includes:
 *
 * - **Cover page** — centred title, subtitle, author, and date with a
 *   trailing page break (can be disabled via {@link ExportOptions.coverPage}).
 * - **Running headers / footers** — document title right-aligned in the
 *   header, "Page N" in the footer.
 * - **Rich section rendering** — headings, paragraphs with inline
 *   markdown-like formatting (`**bold**`, `*italic*`, `[text](url)`),
 *   tables with themed header rows and alternating row shading, bullet
 *   and numbered lists, key-value definition tables, charts rendered as
 *   tabular fallbacks, and embedded images from URL or base64 data.
 *
 * The generator is stateless: every call to {@link DocxGenerator.generate}
 * produces an independent DOCX buffer with no side-effects.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import type { FileChild, ParagraphChild } from 'docx';

import type {
  ChartSpec,
  DocumentContent,
  DocumentSection,
  ExportOptions,
  ImageSpec,
  TableData,
} from '../types.js';

import { getTheme } from '../themes/SlideThemes.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference key for the numbered-list numbering definition. */
const NUMBERING_REFERENCE = 'default-numbering';

/** Accent colour applied when no theme is specified (blue-600). */
const DEFAULT_ACCENT_HEX = '2563EB';

/** Timeout (ms) for fetching remote images. */
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

/** Default image width in pixels when none is specified. */
const DEFAULT_IMAGE_WIDTH_PX = 400;

/** Default image height in pixels when none is specified. */
const DEFAULT_IMAGE_HEIGHT_PX = 300;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip a leading `#` from a hex colour string and return the uppercase
 * 6-character hex code. Falls back to the default accent when the input
 * is falsy or unparseable.
 *
 * @param hex - CSS hex colour such as `'#2563EB'` or `'2563EB'`.
 * @returns Uppercase 6-character hex string without `#`.
 */
function normaliseHex(hex: string | undefined): string {
  if (!hex) return DEFAULT_ACCENT_HEX;
  return hex.replace(/^#/, '').toUpperCase();
}

/**
 * Parse inline markdown-like formatting from a paragraph string and return
 * an array of {@link ParagraphChild} instances (TextRuns and
 * ExternalHyperlinks).
 *
 * Supported patterns:
 * - `**text**` — bold
 * - `*text*`   — italic (only single asterisks that are not part of `**`)
 * - `[text](url)` — external hyperlink
 *
 * Everything else is emitted as a plain {@link TextRun}.
 *
 * @param text - The raw paragraph string to parse.
 * @returns An ordered array of paragraph children.
 */
function parseInlineFormatting(text: string): ParagraphChild[] {
  const children: ParagraphChild[] = [];

  // Combined regex that matches bold (**...**), links ([...](...)), or
  // italic (*...*) — in that precedence order so that ** is consumed
  // before single *.
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|\*(.+?)\*/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Emit any plain text before this match.
    if (match.index > lastIndex) {
      children.push(new TextRun(text.slice(lastIndex, match.index)));
    }

    if (match[1] !== undefined) {
      // Bold: **text**
      children.push(new TextRun({ text: match[1], bold: true }));
    } else if (match[2] !== undefined && match[3] !== undefined) {
      // Link: [text](url)
      children.push(
        new ExternalHyperlink({
          children: [
            new TextRun({
              text: match[2],
              style: 'Hyperlink',
            }),
          ],
          link: match[3],
        }),
      );
    } else if (match[4] !== undefined) {
      // Italic: *text*
      children.push(new TextRun({ text: match[4], italics: true }));
    }

    lastIndex = match.index + match[0].length;
  }

  // Emit any trailing plain text.
  if (lastIndex < text.length) {
    children.push(new TextRun(text.slice(lastIndex)));
  }

  // If nothing was produced (empty string), push an empty run so the
  // Paragraph constructor has at least one child.
  if (children.length === 0) {
    children.push(new TextRun(''));
  }

  return children;
}

/**
 * Convert a {@link ChartSpec} into a {@link TableData} suitable for tabular
 * rendering inside the DOCX. Since native OOXML chart embedding is
 * non-trivial, charts are presented as formatted data tables.
 *
 * @param chart - The chart specification to convert.
 * @returns A TableData representation of the chart data.
 */
function chartToTable(chart: ChartSpec): TableData {
  // Build category labels from the first dataset that has them, or
  // generate numeric indices.
  const firstWithCategories = chart.data.find((ds) => ds.categories?.length);
  const categoryCount = Math.max(
    ...chart.data.map((ds) => ds.values.length),
    0,
  );
  const categories: string[] = firstWithCategories?.categories
    ?? Array.from({ length: categoryCount }, (_, i) => String(i + 1));

  const headers = ['Category', ...chart.data.map((ds) => ds.label)];
  const rows: string[][] = categories.map((cat, idx) => [
    cat,
    ...chart.data.map((ds) => String(ds.values[idx] ?? '')),
  ]);

  return { headers, rows };
}

/**
 * Attempt to fetch image data from a remote URL with a timeout.
 *
 * @param url     - The remote image URL.
 * @param timeout - Timeout in milliseconds.
 * @returns The image data as a Buffer, or `null` on any failure.
 */
async function fetchImageData(
  url: string,
  timeout: number = IMAGE_FETCH_TIMEOUT_MS,
): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

/**
 * Decode a base64 data URI into a raw Buffer.
 *
 * @param dataUri - A string in the format `data:<mime>;base64,<data>`.
 * @returns The decoded Buffer.
 */
function decodeBase64DataUri(dataUri: string): Buffer {
  const commaIndex = dataUri.indexOf(',');
  const raw = commaIndex >= 0 ? dataUri.slice(commaIndex + 1) : dataUri;
  return Buffer.from(raw, 'base64');
}

/**
 * Infer the image type from a URL or data URI for the `docx` package.
 * Falls back to `'png'` when the type cannot be determined.
 *
 * @param source - A URL string or base64 data URI.
 * @returns One of the accepted image type literals.
 */
function inferImageType(source: string): 'jpg' | 'png' | 'gif' | 'bmp' {
  const lower = source.toLowerCase();
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('bmp')) return 'bmp';
  return 'png';
}

// ---------------------------------------------------------------------------
// DocxGenerator
// ---------------------------------------------------------------------------

/**
 * Stateless DOCX generator that converts {@link DocumentContent} into a
 * styled Word document buffer via the `docx` npm package.
 *
 * @example
 * ```ts
 * const generator = new DocxGenerator();
 * const buffer = await generator.generate(content, { coverPage: true });
 * fs.writeFileSync('report.docx', buffer);
 * ```
 */
export class DocxGenerator {
  /**
   * Generate a complete DOCX buffer from structured document content.
   *
   * Processing pipeline:
   *
   * 1. Resolve the visual theme (colours for table headers, accents).
   * 2. Build an optional cover page section (title, subtitle, author, date)
   *    followed by a page break.
   * 3. Iterate over each {@link DocumentSection}, rendering headings,
   *    paragraphs (with inline formatting), tables, charts (as tables),
   *    images, lists, and key-value pairs into an array of `FileChild`
   *    nodes.
   * 4. Wrap everything in a `Document` with header/footer configuration
   *    and a numbered-list numbering definition.
   * 5. Serialise via `Packer.toBuffer()`.
   *
   * @param content - The structured document content to render.
   * @param options - Optional export configuration overrides.
   * @returns A Buffer containing the complete DOCX binary data.
   */
  async generate(
    content: DocumentContent,
    options?: ExportOptions,
  ): Promise<Buffer> {
    const theme = getTheme(content.theme);
    const accentHex = normaliseHex(theme.accentColor);
    const children: FileChild[] = [];

    // ------------------------------------------------------------------
    // 1. Cover page
    // ------------------------------------------------------------------
    const showCover = options?.coverPage !== false;

    if (showCover) {
      this.buildCoverPage(content, children);
    }

    // ------------------------------------------------------------------
    // 2. Section content
    // ------------------------------------------------------------------
    for (const section of content.sections) {
      await this.renderSection(section, children, accentHex);
    }

    // ------------------------------------------------------------------
    // 3. Assemble Document
    // ------------------------------------------------------------------
    const doc = new Document({
      title: content.title,
      creator: content.author ?? 'Document Export Extension',
      numbering: {
        config: [
          {
            reference: NUMBERING_REFERENCE,
            levels: [
              {
                level: 0,
                format: LevelFormat.DECIMAL,
                text: '%1.',
                alignment: AlignmentType.START,
              },
            ],
          },
        ],
      },
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.END,
                  children: [
                    new TextRun({
                      text: content.title,
                      italics: true,
                      color: '888888',
                      size: 18, // 9pt
                    }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'Page ',
                      size: 18,
                      color: '888888',
                    }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      size: 18,
                      color: '888888',
                    }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    });

    // ------------------------------------------------------------------
    // 4. Pack and return
    // ------------------------------------------------------------------
    return Buffer.from(await Packer.toBuffer(doc));
  }

  // =====================================================================
  // Private — cover page
  // =====================================================================

  /**
   * Append cover page paragraphs (title, subtitle, author, date) and a
   * trailing page break to the children array.
   *
   * @param content  - The document content (title, subtitle, author, date).
   * @param children - The mutable array to append FileChild nodes into.
   */
  private buildCoverPage(
    content: DocumentContent,
    children: FileChild[],
  ): void {
    // Vertical spacer to push the title toward the centre of the page.
    children.push(
      new Paragraph({
        spacing: { before: 3600 }, // ~2.5 inches
        text: '',
      }),
    );

    // Title
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.TITLE,
        children: [
          new TextRun({
            text: content.title,
            bold: true,
            size: 56, // 28pt
          }),
        ],
      }),
    );

    // Subtitle
    if (content.subtitle) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [
            new TextRun({
              text: content.subtitle,
              italics: true,
              size: 32, // 16pt
              color: '666666',
            }),
          ],
        }),
      );
    }

    // Author
    if (content.author) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
          children: [
            new TextRun({
              text: content.author,
              size: 24, // 12pt
            }),
          ],
        }),
      );
    }

    // Date
    const dateStr = content.date ?? new Date().toISOString().slice(0, 10);
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [
          new TextRun({
            text: dateStr,
            size: 24,
            color: '888888',
          }),
        ],
      }),
    );

    // Page break after cover
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // =====================================================================
  // Private — section renderer
  // =====================================================================

  /**
   * Render a single {@link DocumentSection} into an array of `FileChild`
   * nodes. Each content type (heading, paragraphs, table, chart, image,
   * list, keyValues) is appended in order.
   *
   * @param section  - The section to render.
   * @param children - The mutable array to append FileChild nodes into.
   * @param accentHex - Uppercase hex colour (no `#`) for table headers.
   */
  private async renderSection(
    section: DocumentSection,
    children: FileChild[],
    accentHex: string,
  ): Promise<void> {
    // ---- Heading ----
    if (section.heading) {
      const headingLevel = this.resolveHeadingLevel(section.level);
      children.push(
        new Paragraph({
          heading: headingLevel,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: section.heading, bold: true })],
        }),
      );
    }

    // ---- Paragraphs ----
    if (section.paragraphs) {
      for (const para of section.paragraphs) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: parseInlineFormatting(para),
          }),
        );
      }
    }

    // ---- Table ----
    if (section.table) {
      children.push(this.buildTable(section.table, accentHex));
      // Spacer after table
      children.push(new Paragraph({ spacing: { after: 120 }, text: '' }));
    }

    // ---- Chart (rendered as a table with a heading) ----
    if (section.chart) {
      const chartTitle = section.chart.title ?? 'Chart Data';
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({ text: chartTitle, bold: true, italics: true }),
          ],
        }),
      );

      const chartTable = chartToTable(section.chart);
      children.push(this.buildTable(chartTable, accentHex));
      children.push(new Paragraph({ spacing: { after: 120 }, text: '' }));
    }

    // ---- Image ----
    if (section.image) {
      await this.renderImage(section.image, children);
    }

    // ---- List ----
    if (section.list) {
      this.renderList(section.list, children);
    }

    // ---- Key-values ----
    if (section.keyValues && section.keyValues.length > 0) {
      children.push(this.buildKeyValueTable(section.keyValues));
      children.push(new Paragraph({ spacing: { after: 120 }, text: '' }));
    }
  }

  // =====================================================================
  // Private — table builder
  // =====================================================================

  /**
   * Build a styled `Table` node from {@link TableData}. Header row gets a
   * coloured background with white bold text; data rows alternate between
   * a light grey and white background for readability.
   *
   * @param table     - The table data to render.
   * @param accentHex - Uppercase 6-char hex for the header background.
   * @returns A `Table` FileChild ready for insertion.
   */
  private buildTable(table: TableData, accentHex: string): Table {
    // Header row
    const headerRow = new TableRow({
      tableHeader: true,
      children: table.headers.map(
        (header) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: header, bold: true, color: 'FFFFFF' }),
                ],
              }),
            ],
            shading: {
              type: ShadingType.SOLID,
              fill: accentHex,
              color: accentHex,
            },
          }),
      ),
    });

    // Data rows with alternating shading
    const dataRows = table.rows.map(
      (row, rowIdx) =>
        new TableRow({
          children: row.map(
            (cellValue) =>
              new TableCell({
                children: [new Paragraph({ text: cellValue })],
                shading:
                  rowIdx % 2 === 0
                    ? {
                        type: ShadingType.SOLID,
                        fill: 'F8F9FA',
                        color: 'F8F9FA',
                      }
                    : undefined,
              }),
          ),
        }),
    );

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    });
  }

  // =====================================================================
  // Private — key-value table
  // =====================================================================

  /**
   * Build a borderless two-column table for key-value pairs. Keys are
   * rendered bold in the left column; values plain in the right column.
   *
   * @param keyValues - Array of `{ key, value }` objects.
   * @returns A `Table` FileChild with no visible borders.
   */
  private buildKeyValueTable(
    keyValues: Array<{ key: string; value: string }>,
  ): Table {
    const noBorder = {
      style: BorderStyle.NONE,
      size: 0,
      color: 'FFFFFF',
    };
    const noBorders = {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder,
    };

    const rows = keyValues.map(
      (kv) =>
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: kv.key, bold: true })],
                }),
              ],
              width: { size: 30, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ text: kv.value })],
              width: { size: 70, type: WidthType.PERCENTAGE },
            }),
          ],
        }),
    );

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows,
    });
  }

  // =====================================================================
  // Private — image renderer
  // =====================================================================

  /**
   * Render an {@link ImageSpec} as an inline image followed by an optional
   * italic caption. Remote images are fetched with a timeout; failures are
   * silently skipped (a placeholder paragraph is emitted instead).
   *
   * @param image    - The image specification (URL or base64 + dimensions).
   * @param children - The mutable array to append FileChild nodes into.
   */
  private async renderImage(
    image: ImageSpec,
    children: FileChild[],
  ): Promise<void> {
    let imageBuffer: Buffer | null = null;
    let imageType: 'jpg' | 'png' | 'gif' | 'bmp' = 'png';

    if (image.base64) {
      imageBuffer = decodeBase64DataUri(image.base64);
      imageType = inferImageType(image.base64);
    } else if (image.url) {
      imageBuffer = await fetchImageData(image.url);
      imageType = inferImageType(image.url);
    }

    if (!imageBuffer) {
      // Could not obtain image data — emit a placeholder.
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[Image not available${image.caption ? `: ${image.caption}` : ''}]`,
              italics: true,
              color: '999999',
            }),
          ],
        }),
      );
      return;
    }

    // Determine dimensions. The `width` field in ImageSpec is in points;
    // the `docx` package transformation uses pixels. We use a 1:1 mapping
    // for simplicity since the output is vector-scaled anyway.
    const width = image.width ?? DEFAULT_IMAGE_WIDTH_PX;
    // Maintain a 4:3 aspect ratio by default when only width is given.
    const height = image.width
      ? Math.round(image.width * (DEFAULT_IMAGE_HEIGHT_PX / DEFAULT_IMAGE_WIDTH_PX))
      : DEFAULT_IMAGE_HEIGHT_PX;

    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: imageType,
            data: imageBuffer,
            transformation: { width, height },
          }),
        ],
      }),
    );

    // Caption
    if (image.caption) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 120 },
          children: [
            new TextRun({
              text: image.caption,
              italics: true,
              size: 20, // 10pt
              color: '666666',
            }),
          ],
        }),
      );
    }
  }

  // =====================================================================
  // Private — list renderer
  // =====================================================================

  /**
   * Render a bullet or numbered list. Bullet lists use the built-in
   * `bullet` paragraph property; numbered lists reference the
   * `default-numbering` config defined at the document level.
   *
   * @param list     - The list specification (`items` + `ordered` flag).
   * @param children - The mutable array to append FileChild nodes into.
   */
  private renderList(
    list: { items: string[]; ordered?: boolean },
    children: FileChild[],
  ): void {
    for (const item of list.items) {
      if (list.ordered) {
        children.push(
          new Paragraph({
            children: parseInlineFormatting(item),
            numbering: { reference: NUMBERING_REFERENCE, level: 0 },
          }),
        );
      } else {
        children.push(
          new Paragraph({
            children: parseInlineFormatting(item),
            bullet: { level: 0 },
          }),
        );
      }
    }

    // Spacer after list
    children.push(new Paragraph({ spacing: { after: 80 }, text: '' }));
  }

  // =====================================================================
  // Private — heading level resolver
  // =====================================================================

  /**
   * Map a section `level` (1 | 2 | 3) to the corresponding `docx`
   * {@link HeadingLevel} constant. Defaults to `HEADING_1` for
   * unspecified levels.
   *
   * @param level - The section heading depth.
   * @returns The `HeadingLevel` value for the `docx` paragraph.
   */
  private resolveHeadingLevel(
    level: 1 | 2 | 3 | undefined,
  ): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
    switch (level) {
      case 2:
        return HeadingLevel.HEADING_2;
      case 3:
        return HeadingLevel.HEADING_3;
      default:
        return HeadingLevel.HEADING_1;
    }
  }
}
