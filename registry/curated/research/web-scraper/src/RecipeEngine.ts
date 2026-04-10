// @ts-nocheck
/**
 * RecipeEngine — Loads, interpolates, and executes multi-step scraping recipes.
 *
 * Recipes are YAML files that define a sequence of {@link RecipeStep}s, each
 * targeting a URL (optionally with `{{param}}` template placeholders) and an
 * optional {@link ExtractConfig} for structured data extraction.
 *
 * The engine resolves recipes from two locations:
 * 1. **Built-in** — `../recipes/` relative to this file (ships with the package).
 * 2. **User-defined** — `~/.wunderland/scraper-recipes/` for custom overrides.
 *
 * User recipes take precedence over built-in recipes with the same name.
 *
 * @module RecipeEngine
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import type {
  Recipe,
  RecipeInput,
  RecipeResult,
  ScrapeResult,
} from './types.js';
import type { WebScraperService } from './WebScraperService.js';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Directory containing built-in recipe YAML files, resolved relative to the
 * compiled output location (`dist/`) back up to `recipes/` at the package root.
 */
const BUILTIN_RECIPES_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'recipes',
);

/** User-specific recipe directory under the wunderland config root. */
const USER_RECIPES_DIR = join(homedir(), '.wunderland', 'scraper-recipes');

/* -------------------------------------------------------------------------- */
/*  RecipeEngine                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Loads and executes multi-step scraping recipes defined in YAML files.
 *
 * Template interpolation supports three syntaxes:
 * - `{{paramName}}` — replaced with the corresponding value from `RecipeInput.params`.
 * - `{{steps.stepName.data.field}}` — replaced with a field from a previous step's
 *   single-record extraction result.
 * - `{{steps.stepName.items[N].field}}` — replaced with a field from a specific item
 *   in a previous step's list extraction result.
 *
 * Steps execute sequentially so that later steps can reference data extracted
 * by earlier ones.
 *
 * @example
 * ```ts
 * const engine = new RecipeEngine(scraperService);
 * await engine.loadRecipes();
 *
 * const result = await engine.execute({
 *   recipe: 'generic-article',
 *   params: { url: 'https://example.com/post/123' },
 * });
 *
 * console.log(result.data);
 * ```
 */
export class RecipeEngine {
  /** Map of recipe name to parsed recipe definition. */
  private readonly recipes = new Map<string, Recipe>();

  /** Reference to the scraper service used to execute each step. */
  private readonly scraper: WebScraperService;

  /**
   * @param scraper - The {@link WebScraperService} instance used for all HTTP
   *                  fetching and extraction within recipe steps.
   */
  constructor(scraper: WebScraperService) {
    this.scraper = scraper;
  }

  /* ---------------------------------------------------------------------- */
  /*  Recipe loading                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Scan both the built-in and user recipe directories, parsing every `.yaml`
   * and `.yml` file found.  User recipes override built-in recipes when names
   * collide.
   *
   * This method is idempotent — calling it multiple times reloads and replaces
   * all recipes from disk.
   */
  async loadRecipes(): Promise<void> {
    this.recipes.clear();

    // Load built-in recipes first (lower precedence)
    await this.loadRecipesFromDir(BUILTIN_RECIPES_DIR);

    // Load user recipes second (higher precedence — overwrites collisions)
    await this.loadRecipesFromDir(USER_RECIPES_DIR);
  }

  /**
   * List the names of all currently loaded recipes.
   *
   * @returns An array of recipe name strings (kebab-case by convention).
   */
  getRecipeNames(): string[] {
    return [...this.recipes.keys()];
  }

  /**
   * Retrieve a loaded recipe by name.
   *
   * @param name - Recipe identifier (case-sensitive, kebab-case).
   * @returns The parsed {@link Recipe} or `undefined` if not found.
   */
  getRecipe(name: string): Recipe | undefined {
    return this.recipes.get(name);
  }

  /* ---------------------------------------------------------------------- */
  /*  Execution                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Execute a named recipe with the provided parameters.
   *
   * Each step's URL template is interpolated against (a) the input params and
   * (b) accumulated results from prior steps.  Steps run sequentially; if any
   * step fails the recipe is aborted and the partial results returned.
   *
   * @param input - The recipe name (or path) and runtime parameters.
   * @returns A {@link RecipeResult} containing aggregated step data.
   */
  async execute(input: RecipeInput): Promise<RecipeResult> {
    const recipe = this.recipes.get(input.recipe);

    if (!recipe) {
      return {
        success: false,
        recipe: input.recipe,
        data: {},
        error: `Recipe "${input.recipe}" not found. Available: ${this.getRecipeNames().join(', ') || '(none)'}`,
      };
    }

    // Merge input params with recipe-declared defaults
    const params = this.resolveParams(recipe, input.params);

    // Accumulator for per-step results, keyed by step name
    const stepResults: Record<string, ScrapeResult> = {};
    const aggregatedData: Record<string, unknown> = {};

    for (const step of recipe.steps) {
      // Interpolate the URL template using params + prior step results
      const resolvedUrl = this.interpolate(step.url, params, stepResults);

      // Interpolate any selector strings that contain templates (rare but supported)
      const resolvedExtract = step.extract
        ? this.interpolateExtract(step.extract, params, stepResults)
        : undefined;

      const result = await this.scraper.scrape({
        url: resolvedUrl,
        extract: resolvedExtract,
        options: step.options,
      });

      // Store raw result for downstream step references
      stepResults[step.name] = result;

      if (!result.success) {
        return {
          success: false,
          recipe: input.recipe,
          data: aggregatedData,
          error: `Step "${step.name}" failed: ${result.error}`,
        };
      }

      // Apply maxItems cap if configured on this step
      if (result.items && step.options?.maxItems) {
        result.items = result.items.slice(0, step.options.maxItems);
      }

      // Aggregate: prefer items for list steps, data for single-record steps
      if (result.items) {
        aggregatedData[step.name] = result.items;
      } else if (result.data) {
        aggregatedData[step.name] = result.data;
      } else if (result.text) {
        aggregatedData[step.name] = { text: result.text };
      }
    }

    return {
      success: true,
      recipe: input.recipe,
      data: aggregatedData,
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Private helpers                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Read all `.yaml` / `.yml` files from a directory and parse each as a
   * {@link Recipe}.  Invalid files are silently skipped with a console warning.
   *
   * @param dir - Absolute path to the recipe directory.
   */
  private async loadRecipesFromDir(dir: string): Promise<void> {
    let entries: string[];

    try {
      entries = await readdir(dir);
    } catch {
      // Directory does not exist — silently skip (expected for user dir on first run)
      return;
    }

    const yamlFiles = entries.filter(
      (f) => f.endsWith('.yaml') || f.endsWith('.yml'),
    );

    for (const file of yamlFiles) {
      try {
        const raw = await readFile(join(dir, file), 'utf-8');
        const parsed = YAML.parse(raw) as Recipe;

        // Derive recipe name from filename if not set in the YAML
        if (!parsed.name) {
          parsed.name = basename(file, file.endsWith('.yaml') ? '.yaml' : '.yml');
        }

        // Basic validation: must have at least one step
        if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
          console.warn(`[RecipeEngine] Skipping "${file}": no steps defined`);
          continue;
        }

        this.recipes.set(parsed.name, parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[RecipeEngine] Failed to parse "${file}": ${msg}`);
      }
    }
  }

  /**
   * Merge user-supplied params with recipe-declared defaults.
   *
   * Default values are encoded in the recipe's `params` map as strings
   * prefixed with `=` (e.g., `{ page: "=1" }`).  If a param has no default
   * and no user value, it resolves to an empty string.
   *
   * @param recipe - The recipe definition.
   * @param userParams - Runtime params from the caller.
   * @returns Fully resolved param map.
   */
  private resolveParams(
    recipe: Recipe,
    userParams: Record<string, string>,
  ): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const [key, spec] of Object.entries(recipe.params)) {
      if (userParams[key] !== undefined) {
        // User-supplied value takes priority
        resolved[key] = userParams[key];
      } else if (spec.startsWith('=')) {
        // Default value (strip the leading `=`)
        resolved[key] = spec.slice(1);
      } else {
        // No default, no user value — empty string
        resolved[key] = '';
      }
    }

    return resolved;
  }

  /**
   * Replace `{{placeholder}}` tokens in a template string.
   *
   * Supported placeholder patterns:
   * - `{{paramName}}` — plain parameter lookup.
   * - `{{steps.stepName.data.field}}` — lookup a field from a prior step's
   *   single-record extraction data.
   * - `{{steps.stepName.items[N].field}}` — lookup a field from the Nth item
   *   in a prior step's list extraction result.
   *
   * Unresolved placeholders are replaced with empty strings.
   *
   * @param template    - String containing `{{...}}` tokens.
   * @param params      - Top-level param values.
   * @param stepResults - Prior step results keyed by step name.
   * @returns The interpolated string.
   */
  private interpolate(
    template: string,
    params: Record<string, string>,
    stepResults: Record<string, ScrapeResult>,
  ): string {
    return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
      const trimmed = expr.trim();

      // Step result reference: steps.stepName.data.fieldName
      // or steps.stepName.items[N].fieldName
      if (trimmed.startsWith('steps.')) {
        return this.resolveStepRef(trimmed, stepResults);
      }

      // Plain param lookup
      return params[trimmed] ?? '';
    });
  }

  /**
   * Resolve a dot-notation step reference like `steps.search.data.url` or
   * `steps.search.items[0].title` against accumulated step results.
   *
   * @param expr        - The full expression (without `{{` / `}}`), e.g.
   *                      `steps.search.data.url`.
   * @param stepResults - Map of step name to its {@link ScrapeResult}.
   * @returns The resolved string value, or empty string if not found.
   */
  private resolveStepRef(
    expr: string,
    stepResults: Record<string, ScrapeResult>,
  ): string {
    // Parse: steps.<stepName>.<path...>
    const parts = expr.split('.');
    if (parts.length < 3 || parts[0] !== 'steps') return '';

    const stepName = parts[1]!;
    const result = stepResults[stepName];
    if (!result) return '';

    const accessor = parts[2]!;

    // Handle "data.fieldName"
    if (accessor === 'data' && parts.length >= 4) {
      const fieldName = parts.slice(3).join('.');
      return result.data?.[fieldName] ?? '';
    }

    // Handle "items[N].fieldName"
    const itemsMatch = accessor.match(/^items\[(\d+)\]$/);
    if (itemsMatch && parts.length >= 4) {
      const index = parseInt(itemsMatch[1]!, 10);
      const fieldName = parts.slice(3).join('.');
      const item = result.items?.[index];
      return item?.[fieldName] ?? '';
    }

    return '';
  }

  /**
   * Deep-interpolate an {@link ExtractConfig}'s selector strings.
   *
   * This allows recipe authors to use template placeholders inside selector
   * values (uncommon but useful for dynamic class names or IDs).
   *
   * @param extract     - The original extraction config.
   * @param params      - Resolved parameters.
   * @param stepResults - Prior step results.
   * @returns A new {@link ExtractConfig} with all selectors interpolated.
   */
  private interpolateExtract(
    extract: import('./types.js').ExtractConfig,
    params: Record<string, string>,
    stepResults: Record<string, ScrapeResult>,
  ): import('./types.js').ExtractConfig {
    const interpolated: import('./types.js').ExtractConfig = {};

    if (extract.fields) {
      interpolated.fields = {};
      for (const [key, selector] of Object.entries(extract.fields)) {
        interpolated.fields[key] = this.interpolate(selector, params, stepResults);
      }
    }

    if (extract.list) {
      interpolated.list = this.interpolate(extract.list, params, stepResults);
    }

    if (extract.listFields) {
      interpolated.listFields = {};
      for (const [key, selector] of Object.entries(extract.listFields)) {
        interpolated.listFields[key] = this.interpolate(selector, params, stepResults);
      }
    }

    return interpolated;
  }
}
