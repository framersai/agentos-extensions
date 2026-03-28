/**
 * Document Export Extension Pack — generates PDF, DOCX, PPTX, CSV, and
 * XLSX documents from structured content provided by agents.
 *
 * Entry point for the extension; follows the standard AgentOS extension
 * pack factory pattern (see {@link createExtensionPack}).
 */

export interface DocumentExportExtensionOptions {
  /** Override the default priority used when registering the tools. */
  priority?: number;
}

/**
 * Factory function called by the AgentOS extension loader. Returns a pack
 * descriptor containing the `document_export` and `document_suggest` tools.
 *
 * @param context - Extension activation context provided by the AgentOS runtime.
 * @returns An extension pack with tool descriptors and lifecycle hooks.
 */
export function createExtensionPack(context: any) {
  const options = (context.options || {}) as DocumentExportExtensionOptions;

  return {
    name: '@framers/agentos-ext-document-export',
    version: '0.1.0',
    descriptors: [],
    onActivate: async () => context.logger?.info('Document Export Extension activated'),
    onDeactivate: async () => context.logger?.info('Document Export Extension deactivated'),
  };
}

export default createExtensionPack;

// Re-export all public types so consumers can `import { ... } from '@framers/agentos-ext-document-export'`.
export type {
  ExportFormat,
  SlideTheme,
  ChartDataSet,
  ChartSpec,
  ImageSpec,
  TableData,
  DocumentSection,
  DocumentContent,
  ExportOptions,
  DocumentExportInput,
  DocumentExportOutput,
  DocumentSuggestInput,
  DocumentSuggestOutput,
} from './types.js';
