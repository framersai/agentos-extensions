/**
 * @module documentSuggest
 *
 * ITool implementation for the `document_suggest` tool. Analyses
 * characteristics of an agent's response (word count, table presence,
 * section structure, analytical content) and recommends appropriate
 * export formats using a pure heuristic — no LLM call required.
 *
 * This tool has no side effects and can be called speculatively after
 * every response to decide whether to offer export options to the user.
 */

import type {
  ITool,
  ToolExecutionContext,
  ToolExecutionResult,
  JSONSchemaObject,
} from '@framers/agentos';

import type {
  DocumentSuggestInput,
  DocumentSuggestOutput,
} from '../types.js';

/**
 * Document Suggest tool — pure-heuristic analysis that determines whether
 * a document export should be offered to the user and in which formats.
 *
 * The heuristic considers:
 * - **Word count** > 500 suggests PDF or DOCX
 * - **Tabular data** suggests CSV or XLSX
 * - **Distinct sections** suggest PPTX
 * - **Analytical/quantitative content** reinforces PDF and XLSX
 * - Minimum threshold of 200 words before any suggestion is made
 *
 * @example
 * ```ts
 * const tool = new DocumentSuggestTool();
 * const result = await tool.execute({
 *   responseText: 'Full analysis text...',
 *   wordCount: 850,
 *   hasTableData: true,
 *   hasSections: true,
 *   isAnalytical: false,
 * }, context);
 *
 * if (result.output?.shouldOffer) {
 *   console.log(result.output.offerText);
 *   // "I can export this as PDF, DOCX, CSV, XLSX, PPTX. Want me to?"
 * }
 * ```
 */
export class DocumentSuggestTool
  implements ITool<DocumentSuggestInput, DocumentSuggestOutput>
{
  readonly id = 'document-suggest-v1';
  readonly name = 'document_suggest';
  readonly displayName = 'Document Suggest';
  readonly description =
    'Analyse an agent response to determine if a document export should be offered and in which formats.';
  readonly category = 'productivity';
  readonly version = '1.0.0';
  readonly hasSideEffects = false;

  /** JSON Schema describing the expected input arguments. */
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      responseText: {
        type: 'string',
        description: 'The full text of the agent response to analyse.',
      },
      wordCount: {
        type: 'integer',
        minimum: 0,
        description: 'Word count of the response.',
      },
      hasTableData: {
        type: 'boolean',
        description: 'Whether the response contains tabular or grid data.',
      },
      hasSections: {
        type: 'boolean',
        description: 'Whether the response is organised into distinct sections.',
      },
      isAnalytical: {
        type: 'boolean',
        description: 'Whether the response contains analytical or quantitative content.',
      },
    },
    required: ['responseText', 'wordCount', 'hasTableData', 'hasSections', 'isAnalytical'],
  };

  readonly requiredCapabilities = ['capability:document_suggest'];

  /**
   * Execute the document suggestion heuristic.
   *
   * Evaluates the input characteristics against a set of rules to build
   * a list of recommended formats. The tool always succeeds (no external
   * dependencies) and returns a structured suggestion.
   *
   * @param args     - The suggestion input with response characteristics.
   * @param _context - Tool execution context (unused in this implementation).
   * @returns A result containing the suggestion output with `shouldOffer`,
   *   `suggestedFormats`, and `offerText`.
   */
  async execute(
    args: DocumentSuggestInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<DocumentSuggestOutput>> {
    const formats: string[] = [];

    // Long-form content is well suited to paginated document formats
    if (args.wordCount > 500) {
      formats.push('pdf', 'docx');
    }

    // Tabular data maps naturally to spreadsheet formats
    if (args.hasTableData) {
      formats.push('csv', 'xlsx');
    }

    // Sectioned content translates well to slide decks
    if (args.hasSections) {
      formats.push('pptx');
    }

    // Analytical content benefits from PDF (charts) and XLSX (data)
    if (args.isAnalytical) {
      if (!formats.includes('pdf')) formats.push('pdf');
      if (!formats.includes('xlsx')) formats.push('xlsx');
    }

    // Only offer export when there are matching formats and enough content
    const shouldOffer = formats.length > 0 && args.wordCount >= 200;
    const unique = [...new Set(formats)];

    let offerText = '';
    if (shouldOffer) {
      const names = unique.map((f) => f.toUpperCase()).join(', ');
      offerText = `I can export this as ${names}. Want me to?`;
    }

    return {
      success: true,
      output: {
        shouldOffer,
        suggestedFormats: unique,
        offerText,
      },
    };
  }
}
