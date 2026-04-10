// @ts-nocheck
/**
 * @module documentExport
 *
 * ITool implementation for the `document_export` tool. Accepts structured
 * {@link DocumentContent} and a target {@link ExportFormat}, generates the
 * document via the appropriate format generator, saves it to the exports
 * directory via {@link ExportFileManager}, and returns file metadata
 * including download and preview URLs.
 *
 * This tool has side effects (creates files on disk) and is categorised
 * under `productivity`.
 */

import type {
  ITool,
  ToolExecutionContext,
  ToolExecutionResult,
  JSONSchemaObject,
} from '@framers/agentos';

import type {
  DocumentExportInput,
  DocumentExportOutput,
  ExportFormat,
} from '../types.js';

import type { CsvGenerator } from '../generators/CsvGenerator.js';
import type { XlsxGenerator } from '../generators/XlsxGenerator.js';
import type { PdfGenerator } from '../generators/PdfGenerator.js';
import type { DocxGenerator } from '../generators/DocxGenerator.js';
import type { SlidesGenerator } from '../generators/SlidesGenerator.js';
import type { ExportFileManager } from '../delivery/ExportFileManager.js';

/** Set of formats that this tool supports. */
const SUPPORTED_FORMATS: ReadonlySet<ExportFormat> = new Set([
  'pdf',
  'docx',
  'pptx',
  'csv',
  'xlsx',
]);

/**
 * Document Export tool — generates PDF, DOCX, PPTX, CSV, or XLSX documents
 * from structured content and saves them to the agent's workspace.
 *
 * Follows the standard AgentOS ITool interface. The tool accepts a format,
 * structured content with sections (text, tables, charts, images, lists),
 * and optional export configuration. It delegates to the appropriate
 * format-specific generator, saves the result via {@link ExportFileManager},
 * and returns file metadata for downstream consumption.
 *
 * @example
 * ```ts
 * const tool = new DocumentExportTool(csv, xlsx, pdf, docx, slides, fileManager);
 * const result = await tool.execute({
 *   format: 'pdf',
 *   content: { title: 'Report', sections: [{ heading: 'Intro', paragraphs: ['Hello'] }] },
 * }, context);
 * ```
 */
export class DocumentExportTool
  implements ITool<DocumentExportInput, DocumentExportOutput>
{
  readonly id = 'document-export-v1';
  readonly name = 'document_export';
  readonly displayName = 'Document Export';
  readonly description =
    'Export structured content to PDF, DOCX, PPTX, CSV, or XLSX with charts, tables, and professional themes.';
  readonly category = 'productivity';
  readonly version = '1.0.0';
  readonly hasSideEffects = true;

  /** JSON Schema describing the expected input arguments. */
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['pdf', 'docx', 'pptx', 'csv', 'xlsx'],
        description: 'Target document format.',
      },
      content: {
        type: 'object',
        description: 'Structured document content to render.',
        properties: {
          title: { type: 'string', description: 'Document title.' },
          subtitle: { type: 'string', description: 'Optional subtitle.' },
          author: { type: 'string', description: 'Author name for metadata.' },
          date: { type: 'string', description: 'Document date (ISO 8601).' },
          theme: {
            type: 'string',
            enum: ['dark', 'light', 'corporate', 'creative', 'minimal'],
            description: 'Visual theme preset.',
          },
          sections: {
            type: 'array',
            description: 'Ordered content sections.',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string', description: 'Section heading.' },
                level: {
                  type: 'integer',
                  enum: [1, 2, 3],
                  description: 'Heading depth.',
                },
                paragraphs: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Body paragraphs.',
                },
                table: {
                  type: 'object',
                  description: 'Tabular data.',
                  properties: {
                    headers: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    rows: {
                      type: 'array',
                      items: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                  },
                  required: ['headers', 'rows'],
                },
                chart: {
                  type: 'object',
                  description: 'Chart specification.',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['bar', 'line', 'pie', 'doughnut', 'area', 'scatter'],
                    },
                    title: { type: 'string' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          label: { type: 'string' },
                          values: { type: 'array', items: { type: 'number' } },
                          categories: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['label', 'values'],
                      },
                    },
                  },
                  required: ['type', 'data'],
                },
                list: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { type: 'string' } },
                    ordered: { type: 'boolean' },
                  },
                  required: ['items'],
                },
                keyValues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: { type: 'string' },
                      value: { type: 'string' },
                    },
                    required: ['key', 'value'],
                  },
                },
              },
            },
          },
        },
        required: ['title', 'sections'],
      },
      options: {
        type: 'object',
        description: 'Optional export configuration.',
        properties: {
          filename: { type: 'string', description: 'Custom output filename (without extension).' },
          pageSize: { type: 'string', enum: ['letter', 'a4', 'legal'] },
          orientation: { type: 'string', enum: ['portrait', 'landscape'] },
          coverPage: { type: 'boolean', description: 'Whether to generate a cover page.' },
          pageNumbers: { type: 'boolean', description: 'Whether to show page numbers.' },
        },
      },
    },
    required: ['format', 'content'],
  };

  readonly requiredCapabilities = ['capability:document_export'];

  /** CSV generator instance. */
  private readonly csvGenerator: CsvGenerator;

  /** XLSX generator instance. */
  private readonly xlsxGenerator: XlsxGenerator;

  /** PDF generator instance. */
  private readonly pdfGenerator: PdfGenerator;

  /** DOCX generator instance. */
  private readonly docxGenerator: DocxGenerator;

  /** PPTX slides generator instance. */
  private readonly slidesGenerator: SlidesGenerator;

  /** File manager for saving and resolving export paths. */
  private readonly fileManager: ExportFileManager;

  /**
   * Create a new DocumentExportTool instance.
   *
   * @param csvGenerator    - Generator for CSV format output.
   * @param xlsxGenerator   - Generator for XLSX format output.
   * @param pdfGenerator    - Generator for PDF format output.
   * @param docxGenerator   - Generator for DOCX format output.
   * @param slidesGenerator - Generator for PPTX format output.
   * @param fileManager     - File manager for persisting generated documents.
   */
  constructor(
    csvGenerator: CsvGenerator,
    xlsxGenerator: XlsxGenerator,
    pdfGenerator: PdfGenerator,
    docxGenerator: DocxGenerator,
    slidesGenerator: SlidesGenerator,
    fileManager: ExportFileManager,
  ) {
    this.csvGenerator = csvGenerator;
    this.xlsxGenerator = xlsxGenerator;
    this.pdfGenerator = pdfGenerator;
    this.docxGenerator = docxGenerator;
    this.slidesGenerator = slidesGenerator;
    this.fileManager = fileManager;
  }

  /**
   * Execute the document export tool.
   *
   * 1. Validates the requested format against the supported set.
   * 2. Delegates to the appropriate format-specific generator to produce
   *    a binary buffer.
   * 3. Saves the buffer to the exports directory via {@link ExportFileManager}.
   * 4. Returns file metadata including paths and URLs.
   *
   * @param args    - The export input specifying format, content, and options.
   * @param _context - Tool execution context (unused in this implementation).
   * @returns A result object containing the export output on success, or an
   *   error message on failure.
   */
  async execute(
    args: DocumentExportInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<DocumentExportOutput>> {
    const { format, content, options } = args;

    // Validate format
    if (!SUPPORTED_FORMATS.has(format)) {
      return {
        success: false,
        error: `Unsupported format: "${format}". Supported formats: ${[...SUPPORTED_FORMATS].join(', ')}`,
      };
    }

    try {
      // Generate the document buffer
      const buffer = await this.generateBuffer(format, content, options);

      // Save to disk
      const title = options?.filename ?? content.title;
      const { filePath, filename } = await this.fileManager.save(buffer, title, format);

      // Build response
      const output: DocumentExportOutput = {
        filePath,
        downloadUrl: this.fileManager.getDownloadUrl(filename),
        previewUrl: this.fileManager.getPreviewUrl(filename),
        format,
        sizeBytes: buffer.length,
        filename,
      };

      return { success: true, output };
    } catch (err: any) {
      return {
        success: false,
        error: `Document export failed: ${err.message ?? String(err)}`,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Private — generation dispatch
  // -----------------------------------------------------------------------

  /**
   * Route to the correct generator based on format and produce a Buffer.
   *
   * @param format  - The target export format.
   * @param content - The structured document content.
   * @param options - Optional export configuration.
   * @returns A Buffer containing the generated document binary data.
   * @throws {Error} If the format is not handled (should not happen after
   *   validation).
   */
  private async generateBuffer(
    format: ExportFormat,
    content: DocumentExportInput['content'],
    options: DocumentExportInput['options'],
  ): Promise<Buffer> {
    switch (format) {
      case 'csv':
        return this.csvGenerator.generate(content);

      case 'xlsx':
        return this.xlsxGenerator.generate(content, options);

      case 'pdf':
        return this.pdfGenerator.generate(content, options);

      case 'docx':
        return this.docxGenerator.generate(content, options);

      case 'pptx':
        return this.slidesGenerator.generate(content, options);

      default: {
        // Exhaustiveness guard
        const _exhaustive: never = format;
        throw new Error(`Unhandled format: ${_exhaustive}`);
      }
    }
  }
}
