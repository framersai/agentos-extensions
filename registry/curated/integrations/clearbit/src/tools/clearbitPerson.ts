/**
 * Clearbit Person Enrichment Tool — ITool implementation for the Clearbit
 * Person API.
 *
 * Given an email address, returns structured person data including name,
 * job title, seniority, company affiliation, social profiles, and location.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult, JSONSchemaObject } from '@framers/agentos';
import { ClearbitService } from '../ClearbitService.js';
import type { ClearbitPerson } from '../ClearbitService.js';

/** Input parameters for the {@link ClearbitPersonTool}. */
export interface ClearbitPersonInput {
  /** The email address to look up. */
  email: string;
}

/** Output shape returned on successful person enrichment. */
export interface ClearbitPersonOutput {
  /** The email that was queried. */
  email: string;
  /** The enriched person record, or `null` if not found. */
  person: ClearbitPerson | null;
}

/**
 * ITool that enriches person data via the Clearbit Person API.
 *
 * @example
 * ```ts
 * const tool = new ClearbitPersonTool('sk_...');
 * const result = await tool.execute({ email: 'jane@stripe.com' }, ctx);
 * ```
 */
export class ClearbitPersonTool implements ITool<ClearbitPersonInput, ClearbitPersonOutput> {
  /** Stable identifier for this tool version. */
  readonly id = 'clearbit-person-v1';
  /** Tool name used for invocation in agent tool calls. */
  readonly name = 'clearbit_person';
  /** Human-readable display name. */
  readonly displayName = 'Clearbit Person Enrichment';
  /** Description surfaced to the LLM for tool selection. */
  readonly description =
    'Look up detailed person information by email address via Clearbit. ' +
    'Returns name, job title, seniority, company, social profiles, and more.';
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
      email: {
        type: 'string',
        description: 'Email address of the person to look up.',
      },
    },
    required: ['email'],
  };

  /** Capabilities this tool provides. */
  readonly requiredCapabilities = ['capability:data_enrichment'];

  /** Underlying API client. */
  private readonly service: ClearbitService;

  /**
   * Create a new ClearbitPersonTool.
   *
   * @param apiKey - Clearbit API key. Falls back to `CLEARBIT_API_KEY` env var.
   */
  constructor(apiKey?: string) {
    this.service = new ClearbitService(apiKey);
  }

  /**
   * Execute the person enrichment lookup.
   *
   * @param args    - Must contain an `email` string.
   * @param _context - Tool execution context (unused).
   * @returns A result envelope with the enriched person data or an error.
   */
  async execute(
    args: ClearbitPersonInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<ClearbitPersonOutput>> {
    if (!args.email) {
      return { success: false, error: 'Missing required parameter: email' };
    }

    try {
      const person = await this.service.person(args.email);

      return {
        success: true,
        output: {
          email: args.email,
          person,
        },
      };
    } catch (err: any) {
      return { success: false, error: `Clearbit person lookup failed: ${err.message}` };
    }
  }
}
