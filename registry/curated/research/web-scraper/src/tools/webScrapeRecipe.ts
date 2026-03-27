/**
 * Web Scrape Recipe Tool — ITool implementation for multi-step recipe execution.
 *
 * Exposes the {@link RecipeEngine} as a tool callable by any AgentOS GMI.
 * Agents specify a recipe name and parameters; the engine handles multi-step
 * orchestration, template interpolation, and data aggregation.
 *
 * @module tools/webScrapeRecipe
 */

import type {
  ITool,
  ToolExecutionContext,
  ToolExecutionResult,
  JSONSchemaObject,
} from '@framers/agentos';

import type { RecipeInput, RecipeResult } from '../types.js';
import type { RecipeEngine } from '../RecipeEngine.js';

/* -------------------------------------------------------------------------- */
/*  WebScrapeRecipeTool                                                        */
/* -------------------------------------------------------------------------- */

/**
 * ITool implementation that executes named scraping recipes.
 *
 * Recipes are multi-step scraping workflows defined in YAML files.  Each step
 * can reference data extracted by previous steps via `{{steps.stepName.data.field}}`
 * template syntax, enabling complex chained scraping tasks (e.g., search then
 * scrape each result page).
 *
 * @example
 * ```ts
 * const tool = new WebScrapeRecipeTool(recipeEngine);
 * const result = await tool.execute(
 *   { recipe: 'letterboxd-movie', params: { query: 'Arrival' } },
 *   context,
 * );
 * ```
 */
export class WebScrapeRecipeTool implements ITool<RecipeInput, RecipeResult> {
  readonly id = 'web-scrape-recipe-v1';
  readonly name = 'web_scrape_recipe';
  readonly displayName = 'Web Scrape Recipe';
  readonly description =
    'Execute a named multi-step scraping recipe.  Recipes define a sequence ' +
    'of URL targets with extraction configs, where each step can reference ' +
    'data from previous steps via template placeholders.  Use this for ' +
    'structured, repeatable data extraction workflows.  Call with just the ' +
    'recipe name and parameters — the engine handles orchestration.';
  readonly category = 'research';
  readonly version = '1.0.0';
  readonly hasSideEffects = false;

  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      recipe: {
        type: 'string',
        description:
          'Name of the recipe to execute (e.g., "generic-article", "letterboxd-movie").',
      },
      params: {
        type: 'object',
        description:
          'Runtime parameter values for the recipe.  Keys must match the ' +
          'parameter names declared in the recipe definition.',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['recipe', 'params'],
  };

  readonly requiredCapabilities = ['capability:web_scrape'];

  /** Reference to the shared recipe engine. */
  private readonly engine: RecipeEngine;

  /**
   * @param engine - A pre-configured {@link RecipeEngine} instance with
   *                 recipes already loaded.
   */
  constructor(engine: RecipeEngine) {
    this.engine = engine;
  }

  /**
   * Execute a named recipe with the provided parameters.
   *
   * @param args     - The recipe name and runtime parameters.
   * @param _context - Tool execution context (unused but required by ITool contract).
   * @returns A {@link ToolExecutionResult} wrapping the {@link RecipeResult}.
   */
  async execute(
    args: RecipeInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<RecipeResult>> {
    try {
      const result = await this.engine.execute(args);

      return {
        success: result.success,
        output: result,
        error: result.error,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `web_scrape_recipe execution failed: ${msg}`,
      };
    }
  }

  /**
   * Custom validation: ensure the recipe name is non-empty and params is an object.
   *
   * @param args - Raw arguments from the LLM.
   * @returns Validation result with error details if invalid.
   */
  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: any[] } {
    const errors: string[] = [];

    if (!args.recipe || typeof args.recipe !== 'string') {
      errors.push('`recipe` must be a non-empty string.');
    }

    if (args.params !== undefined && (typeof args.params !== 'object' || args.params === null)) {
      errors.push('`params` must be an object mapping parameter names to string values.');
    }

    return { isValid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
