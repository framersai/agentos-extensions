/**
 * @module types
 *
 * Shared type definitions for the Document Export extension. Every interface
 * and field carries thorough TSDoc so consumers (and the LLM tool-calling
 * layer) can understand the shape without reading implementation code.
 */

// ---------------------------------------------------------------------------
// Format type alias
// ---------------------------------------------------------------------------

/**
 * Union of all supported export formats.
 *
 * - `pdf`  — Portable Document Format (via PDFKit)
 * - `docx` — Microsoft Word Open XML
 * - `pptx` — Microsoft PowerPoint Open XML
 * - `csv`  — Comma-Separated Values (tabular only)
 * - `xlsx` — Microsoft Excel Open XML
 */
export type ExportFormat = 'pdf' | 'docx' | 'pptx' | 'csv' | 'xlsx';

// ---------------------------------------------------------------------------
// Slide / presentation themes
// ---------------------------------------------------------------------------

/**
 * Visual theme definition used primarily for PPTX slide decks but also
 * applied to PDF cover pages and XLSX header styling.
 *
 * Each theme bundles a cohesive set of colours, fonts, and a chart colour
 * palette so that generated documents look polished out of the box.
 */
export interface SlideTheme {
  /** Human-readable theme identifier (e.g. "corporate", "dark"). */
  name: string;

  /** CSS hex colour for the slide / page background. */
  background: string;

  /** CSS hex colour for body text. */
  textColor: string;

  /** CSS hex colour for titles and headings. */
  titleColor: string;

  /** CSS hex colour for secondary / muted text (subtitles, captions). */
  mutedColor: string;

  /** CSS hex colour used for highlights, links, and accents. */
  accentColor: string;

  /** Font family name for titles (e.g. "Helvetica Neue"). */
  titleFont: string;

  /** Font family name for body text (e.g. "Arial"). */
  bodyFont: string;

  /** Ordered palette of CSS hex colours used for chart series. */
  chartPalette: string[];
}

// ---------------------------------------------------------------------------
// Chart & image primitives
// ---------------------------------------------------------------------------

/**
 * A single data series inside a {@link ChartSpec}.
 *
 * For bar / line / area charts each `values` entry corresponds to a category
 * in `categories`. For pie / doughnut charts `categories` label each slice.
 */
export interface ChartDataSet {
  /** Human-readable series label shown in the chart legend. */
  label: string;

  /** Numeric values for this series — one per category. */
  values: number[];

  /**
   * Category labels along the x-axis (bar/line) or slice labels (pie).
   * When omitted the generator auto-creates "1", "2", ... indices.
   */
  categories?: string[];

  /** Optional CSS hex colour override for this series. */
  color?: string;
}

/**
 * Specification for an embedded chart inside a document section.
 *
 * The generator renders the chart natively in the target format (e.g.
 * `pptxgenjs` chart objects, SVG-to-PDF for PDFKit, ExcelJS chart sheets).
 */
export interface ChartSpec {
  /** The visual chart type to render. */
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'area' | 'scatter';

  /** Optional chart title displayed above the chart area. */
  title?: string;

  /** One or more data series to plot. */
  data: ChartDataSet[];

  /** Label for the horizontal axis (bar / line / area / scatter). */
  xAxisLabel?: string;

  /** Label for the vertical axis (bar / line / area / scatter). */
  yAxisLabel?: string;
}

/**
 * Reference to an image to embed in a section. Provide either a remote
 * `url` or an inline `base64` data URI — not both.
 */
export interface ImageSpec {
  /** Remote URL of the image (HTTPS preferred). */
  url?: string;

  /**
   * Base-64 encoded image data. Must include the data-URI prefix
   * (e.g. `data:image/png;base64,...`).
   */
  base64?: string;

  /** Optional caption rendered below the image. */
  caption?: string;

  /**
   * Desired display width in points (PDF) or inches (PPTX).
   * The generator preserves aspect ratio when only width is given.
   */
  width?: number;
}

// ---------------------------------------------------------------------------
// Table data
// ---------------------------------------------------------------------------

/**
 * Tabular data that can be rendered as a table in any format or exported
 * directly to CSV / XLSX.
 */
export interface TableData {
  /** Column header labels. */
  headers: string[];

  /** Two-dimensional array of cell values — one inner array per row. */
  rows: string[][];

  /**
   * Optional per-column width hints (in points for PDF, characters for
   * XLSX). When omitted the generator auto-sizes columns.
   */
  columnWidths?: number[];
}

// ---------------------------------------------------------------------------
// Document sections
// ---------------------------------------------------------------------------

/**
 * A single logical section of a document. Sections are rendered in order
 * and may contain a mix of text, tables, charts, images, and lists.
 *
 * For PPTX each section maps to one slide; for PDF/DOCX they flow
 * continuously unless a page break is implied by heading level changes.
 */
export interface DocumentSection {
  /** Optional section heading text. */
  heading?: string;

  /**
   * Heading depth — 1 is top-level (maps to H1 / Heading1 / slide title),
   * 2 is a sub-heading, 3 is a minor heading.
   */
  level?: 1 | 2 | 3;

  /** One or more body paragraphs rendered as flowing text. */
  paragraphs?: string[];

  /** Tabular data to render as a formatted table. */
  table?: TableData;

  /** Chart specification to render inline. */
  chart?: ChartSpec;

  /** Image to embed in this section. */
  image?: ImageSpec;

  /**
   * Bulleted or numbered list. When `ordered` is true the generator
   * renders a numbered (1. 2. 3.) list; otherwise bullets.
   */
  list?: {
    /** The list item strings. */
    items: string[];
    /** Whether to render as an ordered (numbered) list. */
    ordered?: boolean;
  };

  /**
   * Key-value pairs rendered as a two-column definition list or table.
   * Ideal for metadata, settings summaries, or quick-reference cards.
   */
  keyValues?: Array<{
    /** The label / key. */
    key: string;
    /** The corresponding value. */
    value: string;
  }>;

  /**
   * Speaker notes attached to a PPTX slide. Ignored for other formats.
   */
  speakerNotes?: string;

  /**
   * Slide layout hint for PPTX generation. Ignored for other formats.
   *
   * - `title`       — large centred title slide
   * - `content`     — standard title + body
   * - `two-column`  — side-by-side content columns
   * - `image-left`  — image on the left, text on the right
   * - `image-right` — image on the right, text on the left
   * - `chart-full`  — full-bleed chart slide
   * - `comparison`  — two-panel comparison layout
   */
  layout?: 'title' | 'content' | 'two-column' | 'image-left' | 'image-right' | 'chart-full' | 'comparison';
}

// ---------------------------------------------------------------------------
// Top-level document content
// ---------------------------------------------------------------------------

/**
 * The complete structured content payload that drives document generation
 * across all export formats. Every generator reads from this single shape.
 */
export interface DocumentContent {
  /** Document title — used for cover pages, file metadata, and sheet names. */
  title: string;

  /** Optional subtitle shown below the title on cover pages. */
  subtitle?: string;

  /** Author name embedded in document metadata. */
  author?: string;

  /**
   * Document date string (ISO 8601 preferred). Used on cover pages and
   * in workbook / PDF metadata. Defaults to today when omitted.
   */
  date?: string;

  /**
   * Visual theme preset. Controls colours, fonts, and chart palettes
   * across all generators that support theming.
   *
   * - `dark`       — dark background, light text
   * - `light`      — white background, dark text (default)
   * - `corporate`  — navy/grey palette with serif titles
   * - `creative`   — bold accent colours, rounded elements
   * - `minimal`    — monochrome, generous whitespace
   */
  theme?: 'dark' | 'light' | 'corporate' | 'creative' | 'minimal';

  /** Ordered list of content sections that make up the document body. */
  sections: DocumentSection[];
}

// ---------------------------------------------------------------------------
// Export options
// ---------------------------------------------------------------------------

/**
 * Optional configuration that controls how the generated file is written
 * and formatted. All fields are optional with sensible defaults.
 */
export interface ExportOptions {
  /**
   * Desired output filename (without extension — the generator appends
   * the correct one). Defaults to a slugified version of the title.
   */
  filename?: string;

  /** Page size for paginated formats (PDF, DOCX). */
  pageSize?: 'letter' | 'a4' | 'legal';

  /** Page orientation for paginated formats. */
  orientation?: 'portrait' | 'landscape';

  /** Whether to generate a cover / title page (PDF, DOCX, PPTX). */
  coverPage?: boolean;

  /** Whether to add page numbers in the footer (PDF, DOCX). */
  pageNumbers?: boolean;

  /**
   * Explicit worksheet name for single-sheet XLSX exports. When omitted
   * the generator uses section headings or "Sheet 1".
   */
  sheetName?: string;
}

// ---------------------------------------------------------------------------
// Tool I/O shapes
// ---------------------------------------------------------------------------

/**
 * Input payload accepted by the `document_export` tool.
 *
 * The agent provides the desired format, the structured content, and
 * optional formatting overrides. The tool returns a file reference.
 */
export interface DocumentExportInput {
  /** Target document format. */
  format: ExportFormat;

  /** Structured content to render into the document. */
  content: DocumentContent;

  /** Optional export configuration overrides. */
  options?: ExportOptions;
}

/**
 * Output returned by the `document_export` tool after a successful
 * generation. Contains all the information needed to deliver the file
 * to the end user.
 */
export interface DocumentExportOutput {
  /** Absolute path to the generated file on the local filesystem. */
  filePath: string;

  /** Public URL where the file can be downloaded (if hosting is configured). */
  downloadUrl: string;

  /** URL for an inline preview (e.g. first-page thumbnail). */
  previewUrl: string;

  /** The format that was actually generated (echoed from input). */
  format: string;

  /** File size in bytes. */
  sizeBytes: number;

  /** Final filename including extension. */
  filename: string;
}

/**
 * Input payload accepted by the `document_suggest` tool.
 *
 * Analyses characteristics of an agent response to decide whether
 * offering a document export would be useful to the user.
 */
export interface DocumentSuggestInput {
  /** The full text of the agent's response to analyse. */
  responseText: string;

  /** Word count of the response. */
  wordCount: number;

  /** Whether the response contains tabular / grid data. */
  hasTableData: boolean;

  /** Whether the response is organised into distinct sections. */
  hasSections: boolean;

  /** Whether the response contains analytical / quantitative content. */
  isAnalytical: boolean;
}

/**
 * Output returned by the `document_suggest` tool indicating whether a
 * document export should be offered and in which formats.
 */
export interface DocumentSuggestOutput {
  /** `true` when the response is a good candidate for export. */
  shouldOffer: boolean;

  /**
   * Ordered list of recommended export formats, most appropriate first.
   * E.g. `['xlsx', 'csv']` for highly tabular data.
   */
  suggestedFormats: string[];

  /**
   * A natural-language prompt the agent can present to the user, e.g.
   * "Would you like me to export this analysis as a spreadsheet?"
   */
  offerText: string;
}
