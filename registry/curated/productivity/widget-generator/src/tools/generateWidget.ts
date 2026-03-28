/**
 * @module generateWidget
 *
 * ITool implementation for the `generate_widget` tool. Accepts raw HTML
 * content from an agent, applies the {@link WidgetWrapper} safety layer,
 * persists the result via {@link WidgetFileManager}, and returns URLs
 * and metadata for embedding or download.
 *
 * Supports any browser-based library loaded via CDN including Three.js,
 * D3.js, Chart.js, Plotly, Leaflet, p5.js, and more.
 */

import type {
  ITool,
  ToolExecutionContext,
  ToolExecutionResult,
  JSONSchemaObject,
} from '@framers/agentos';

import type { GenerateWidgetInput, GenerateWidgetOutput } from '../types.js';
import type { WidgetWrapper } from '../WidgetWrapper.js';
import type { WidgetFileManager } from '../WidgetFileManager.js';

/**
 * Inline size threshold in bytes. Widgets smaller than this are flagged
 * as safe for inline embedding (e.g. in an iframe srcdoc attribute).
 */
const INLINE_THRESHOLD_BYTES = 30 * 1024; // 30 KB

/**
 * Minimum HTML markers that must appear in the input to be considered
 * valid widget content. At least one must be present.
 */
const VALID_HTML_MARKERS = ['<html', '<body', '<script', '<div', '<canvas', '<svg'];

/**
 * Generates self-contained interactive HTML/CSS/JS widgets.
 *
 * This tool accepts complete HTML content, wraps it with structural
 * defaults and an error boundary via {@link WidgetWrapper}, saves the
 * result to disk via {@link WidgetFileManager}, and returns the file
 * path, URLs, and metadata needed to serve or embed the widget.
 *
 * @example
 * ```ts
 * const tool = new GenerateWidgetTool(wrapper, fileManager);
 * const result = await tool.execute({
 *   html: '<html><body><canvas id="c"></canvas><script>...</script></body></html>',
 *   title: '3D Solar System',
 *   description: 'Interactive Three.js solar system visualization',
 * }, context);
 * ```
 */
export class GenerateWidgetTool implements ITool<GenerateWidgetInput, GenerateWidgetOutput> {
  /** @inheritdoc */
  readonly id = 'widget-generator-v1';

  /** @inheritdoc */
  readonly name = 'generate_widget';

  /** @inheritdoc */
  readonly displayName = 'Generate Interactive Widget';

  /** @inheritdoc */
  readonly description =
    'Generate a self-contained interactive HTML/CSS/JS widget. ' +
    'Supports Three.js, D3.js, Chart.js, Plotly, Leaflet, p5.js, ' +
    'and any browser-based library loaded via CDN.';

  /** @inheritdoc */
  readonly category = 'productivity';

  /** @inheritdoc */
  readonly version = '1.0.0';

  /** @inheritdoc */
  readonly hasSideEffects = true;

  /** @inheritdoc */
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      html: {
        type: 'string',
        description: 'Complete HTML content for the widget.',
      },
      title: {
        type: 'string',
        description: 'Short title (used in filename and preview card).',
      },
      description: {
        type: 'string',
        description: 'Optional description shown in preview cards.',
      },
    },
    required: ['html', 'title'],
  };

  /** @inheritdoc */
  readonly requiredCapabilities = ['capability:widget_generation'];

  /** The safety wrapper that adds structural defaults and error boundary. */
  private readonly wrapper: WidgetWrapper;

  /** The file manager responsible for persisting widgets to disk. */
  private readonly fileManager: WidgetFileManager;

  /**
   * Create a new GenerateWidgetTool instance.
   *
   * @param wrapper     - The {@link WidgetWrapper} used to apply safety defaults.
   * @param fileManager - The {@link WidgetFileManager} used for file persistence.
   */
  constructor(wrapper: WidgetWrapper, fileManager: WidgetFileManager) {
    this.wrapper = wrapper;
    this.fileManager = fileManager;
  }

  /**
   * Execute the widget generation pipeline.
   *
   * 1. Validates that the HTML contains at least one recognized HTML marker.
   * 2. Applies the safety wrapper (doctype, charset, viewport, reset, error boundary).
   * 3. Saves the wrapped HTML to disk with a timestamped, slugified filename.
   * 4. Returns file path, URLs, inline eligibility, and the final HTML content.
   *
   * @param args    - The {@link GenerateWidgetInput} containing HTML, title, and optional description.
   * @param _context - The tool execution context (unused but required by the ITool interface).
   * @returns A {@link ToolExecutionResult} wrapping the {@link GenerateWidgetOutput}.
   */
  async execute(
    args: GenerateWidgetInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<GenerateWidgetOutput>> {
    // 1. Validate: check html contains at least one recognized marker
    const lowerHtml = args.html.toLowerCase();
    const hasValidMarker = VALID_HTML_MARKERS.some((marker) => lowerHtml.includes(marker));

    if (!hasValidMarker) {
      return {
        success: false,
        error:
          'Invalid widget HTML: content must contain at least one of ' +
          VALID_HTML_MARKERS.join(', ') +
          '.',
      };
    }

    try {
      // 2. Wrap with safety defaults
      const wrapped = this.wrapper.wrap(args.html);

      // 3. Save to disk
      const { filePath, filename } = await this.fileManager.save(wrapped, args.title);

      // 4. Compute metadata
      const sizeBytes = Buffer.byteLength(wrapped, 'utf-8');
      const inline = sizeBytes < INLINE_THRESHOLD_BYTES;

      return {
        success: true,
        output: {
          filePath,
          widgetUrl: this.fileManager.getWidgetUrl(filename),
          downloadUrl: this.fileManager.getDownloadUrl(filename),
          inline,
          html: wrapped,
          sizeBytes,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Widget generation failed: ${err.message}`,
      };
    }
  }
}
