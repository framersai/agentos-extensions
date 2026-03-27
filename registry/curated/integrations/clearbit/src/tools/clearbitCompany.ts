/**
 * Clearbit Company Enrichment Tool — ITool implementation for the Clearbit
 * Company API.
 *
 * Given a web domain, returns structured company data including industry,
 * employee count, revenue estimates, tech stack, and social profiles.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult, JSONSchemaObject } from '@framers/agentos';
import { ClearbitService } from '../ClearbitService.js';
import type { ClearbitCompany } from '../ClearbitService.js';

/** Input parameters for the {@link ClearbitCompanyTool}. */
export interface ClearbitCompanyInput {
  /** The company domain to look up (e.g. `"stripe.com"`). */
  domain: string;
}

/** Output shape returned on successful company enrichment. */
export interface ClearbitCompanyOutput {
  /** The domain that was queried. */
  domain: string;
  /** The enriched company record, or `null` if not found. */
  company: ClearbitCompany | null;
}

/**
 * ITool that enriches company data via the Clearbit Company API.
 *
 * @example
 * ```ts
 * const tool = new ClearbitCompanyTool('sk_...');
 * const result = await tool.execute({ domain: 'stripe.com' }, ctx);
 * ```
 */
export class ClearbitCompanyTool implements ITool<ClearbitCompanyInput, ClearbitCompanyOutput> {
  /** Stable identifier for this tool version. */
  readonly id = 'clearbit-company-v1';
  /** Tool name used for invocation in agent tool calls. */
  readonly name = 'clearbit_company';
  /** Human-readable display name. */
  readonly displayName = 'Clearbit Company Enrichment';
  /** Description surfaced to the LLM for tool selection. */
  readonly description =
    'Look up detailed company information by web domain via Clearbit. ' +
    'Returns industry, employee count, revenue, tech stack, social profiles, and more.';
  /** Capability category for discovery grouping. */
  readonly category = 'data-enrichment';
  /** Semantic version of this tool. */
  readonly version = '1.0.0';
  /** This tool performs read-only lookups with no side effects. */
  readonly hasSideEffects = false;

  /** JSON Schema describing the expected input. */
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: 'Company web domain to look up (e.g. "stripe.com").',
      },
    },
    required: ['domain'],
  };

  /** Capabilities this tool provides. */
  readonly requiredCapabilities = ['capability:data_enrichment'];

  /** Underlying API client. */
  private readonly service: ClearbitService;

  /**
   * Create a new ClearbitCompanyTool.
   *
   * @param apiKey - Clearbit API key. Falls back to `CLEARBIT_API_KEY` env var.
   */
  constructor(apiKey?: string) {
    this.service = new ClearbitService(apiKey);
  }

  /**
   * Execute the company enrichment lookup.
   *
   * @param args    - Must contain a `domain` string.
   * @param _context - Tool execution context (unused).
   * @returns A result envelope with the enriched company data or an error.
   */
  async execute(
    args: ClearbitCompanyInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<ClearbitCompanyOutput>> {
    if (!args.domain) {
      return { success: false, error: 'Missing required parameter: domain' };
    }

    try {
      const company = await this.service.company(args.domain);

      return {
        success: true,
        output: {
          domain: args.domain,
          company,
        },
      };
    } catch (err: any) {
      return { success: false, error: `Clearbit company lookup failed: ${err.message}` };
    }
  }
}
