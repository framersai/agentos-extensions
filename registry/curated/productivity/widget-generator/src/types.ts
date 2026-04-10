// @ts-nocheck
/**
 * @module types
 *
 * Shared type definitions for the Widget Generator extension. Defines the
 * input and output shapes used by the {@link GenerateWidgetTool}.
 */

/**
 * Input to the `generate_widget` tool.
 *
 * The agent provides complete HTML content and a human-readable title.
 * The extension handles safety wrapping, file persistence, and URL
 * generation automatically.
 */
export interface GenerateWidgetInput {
  /** Complete HTML content for the widget. */
  html: string;

  /** Short title (used in filename and preview card). */
  title: string;

  /** Optional description shown in preview cards. */
  description?: string;
}

/**
 * Output from the `generate_widget` tool.
 *
 * Contains all the information needed to reference, embed, download,
 * or inline the generated widget.
 */
export interface GenerateWidgetOutput {
  /** Absolute path to the saved HTML file. */
  filePath: string;

  /** HTTP URL to view the widget via the agent server. */
  widgetUrl: string;

  /** HTTP URL to download the raw HTML file. */
  downloadUrl: string;

  /** Whether the HTML is small enough to embed inline (<30 KB). */
  inline: boolean;

  /** The final HTML content with safety wrapper applied. */
  html: string;

  /** File size in bytes. */
  sizeBytes: number;
}
