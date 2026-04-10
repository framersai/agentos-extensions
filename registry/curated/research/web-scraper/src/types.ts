// @ts-nocheck
/**
 * Web Scraper Extension — Shared Type Definitions
 *
 * All types used across the web scraper extension, including scrape inputs/outputs,
 * extraction configuration, recipe definitions, and result shapes. These types form
 * the public API surface for programmatic consumers and tool integrations.
 *
 * @module types
 */

/* -------------------------------------------------------------------------- */
/*  Scrape Options                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The four progressive scraping tiers, ordered by cost and stealth.
 *
 * - **1** — Plain `fetch()` with randomized User-Agent and browser headers.
 * - **2** — Headless Playwright (dynamic import; gracefully degrades if missing).
 * - **3** — Playwright with anti-detection measures (viewport jitter, webdriver
 *           override, human-like scrolling and delays).
 * - **4** — Raw text retrieval with `_llmExtractionRequired` flag, delegating
 *           structured extraction to the calling agent runtime.
 */
export type ScrapeTier = 1 | 2 | 3 | 4;

/**
 * Configuration that controls *how* a page is fetched.
 *
 * Every field is optional — sensible defaults are applied by
 * {@link WebScraperService} when values are omitted.
 */
export interface ScrapeOptions {
  /**
   * Starting tier for this request (1-4).
   * If omitted the service starts at tier 1 and falls back upward.
   */
  tier?: ScrapeTier;

  /**
   * Highest tier the service is allowed to escalate to.
   * Defaults to `4`. Set to `1` to prevent any fallback.
   */
  maxTier?: ScrapeTier;

  /**
   * A single HTTP or SOCKS5 proxy URL to route requests through.
   * Overrides any proxy list configured at the service level.
   *
   * @example "http://user:pass@proxy.example.com:8080"
   */
  proxy?: string;

  /**
   * Extra HTTP headers merged on top of the auto-generated browser
   * header set.  Useful for passing auth cookies or custom tokens.
   */
  headers?: Record<string, string>;

  /**
   * CSS selector to wait for before considering the page "loaded".
   * Only effective for tier 2+ (Playwright).
   *
   * @example "#main-content"
   */
  waitFor?: string;

  /**
   * Per-request timeout in milliseconds.
   * Defaults to `30_000` (30 seconds).
   */
  timeout?: number;

  /**
   * Whether the target page requires JavaScript to render meaningful
   * content.  When `true` the service skips tier 1 and starts at tier 2.
   * Defaults to `false`.
   */
  javascript?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Extraction Config                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Describes *what* to extract from the fetched HTML.
 *
 * Supports two modes:
 * 1. **Single-record** — populate `fields` to extract one value per key.
 * 2. **List** — populate `list` with a repeating container selector and
 *    `listFields` with per-item field selectors.
 *
 * Selectors use a simplified CSS-like micro-syntax handled entirely by
 * regex (no DOM parser required):
 * - `tag` — first matching HTML tag
 * - `.class` — first element with that class
 * - `#id` — element by id
 * - `tag.class` — tag with class
 * - `tag @attr` — extract an attribute value instead of text content
 *
 * @example
 * ```ts
 * const extract: ExtractConfig = {
 *   fields: {
 *     title: 'h1.article-title',
 *     author: '.byline .author',
 *     heroImage: 'img.hero @src',
 *   },
 * };
 * ```
 */
export interface ExtractConfig {
  /**
   * Map of output field name to a CSS-like selector.
   * Each selector extracts a single text value (or attribute when
   * the `@attr` suffix is present).
   */
  fields?: Record<string, string>;

  /**
   * Selector for the repeating container element in a list view.
   *
   * @example ".search-result"
   */
  list?: string;

  /**
   * Per-item field selectors (relative to each `list` container match).
   * Only meaningful when `list` is set.
   */
  listFields?: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/*  Scrape Input / Result                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Input payload for a single scrape request.
 */
export interface ScrapeInput {
  /** Fully qualified URL to scrape. */
  url: string;

  /**
   * Optional extraction config.  When omitted the service returns
   * raw HTML and/or plain text.
   */
  extract?: ExtractConfig;

  /** Optional per-request scrape options. */
  options?: ScrapeOptions;
}

/**
 * Result payload returned from a single scrape attempt.
 */
export interface ScrapeResult {
  /** Whether the scrape completed without fatal errors. */
  success: boolean;

  /** The URL that was scraped (may differ from input after redirects). */
  url: string;

  /**
   * The tier that ultimately produced this result.
   * `0` if all tiers failed.
   */
  tier: ScrapeTier | 0;

  /**
   * Extracted single-record data when `ExtractConfig.fields` was used.
   * Keys mirror the field names from the config.
   */
  data?: Record<string, string>;

  /**
   * Extracted list data when `ExtractConfig.list` / `listFields` was used.
   * Each item is a record whose keys mirror `listFields`.
   */
  items?: Record<string, string>[];

  /** Raw HTML of the page (present when no extraction config is given). */
  html?: string;

  /** Visible text content of the page (scripts / styles stripped). */
  text?: string;

  /** HTTP status code from the final response (0 if never reached). */
  statusCode: number;

  /** Human-readable error message when `success` is `false`. */
  error?: string;

  /**
   * When `true`, the raw text was retrieved but structured extraction
   * could not be performed locally.  The agent runtime should apply
   * LLM-based extraction using the `text` field and the original
   * `ExtractConfig`.
   */
  _llmExtractionRequired?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Recipes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A single step inside a scraping {@link Recipe}.
 *
 * Each step targets one URL (which may contain `{{param}}` template
 * placeholders) and optionally extracts fields from the response.
 */
export interface RecipeStep {
  /** Human-readable step label for logging / progress. */
  name: string;

  /**
   * URL template.  Supports `{{paramName}}` placeholders that are
   * interpolated from `RecipeInput.params`.
   *
   * @example "https://example.com/search?q={{query}}&page={{page}}"
   */
  url: string;

  /** Extraction config for this step. */
  extract?: ExtractConfig;

  /** Per-step scrape options. */
  options?: ScrapeOptions & {
    /**
     * When extracting a list, cap the number of items returned.
     * Defaults to unlimited.
     */
    maxItems?: number;
  };
}

/**
 * A named, reusable scraping recipe that packages one or more ordered
 * {@link RecipeStep}s along with parameter metadata and output mapping.
 *
 * Recipes can be defined in YAML files inside the `recipes/` directory
 * and loaded at runtime via the `web_scrape_recipe` tool.
 */
export interface Recipe {
  /** Unique recipe identifier (kebab-case by convention). */
  name: string;

  /** Short human-readable description of what this recipe extracts. */
  description: string;

  /** Semver version string for the recipe definition. */
  version: string;

  /**
   * Named parameters the recipe requires at invocation time.
   * Keys are parameter names, values are short descriptions or
   * default-value strings prefixed with `=`.
   *
   * @example { "query": "Search term", "page": "=1" }
   */
  params: Record<string, string>;

  /** Ordered list of steps to execute. */
  steps: RecipeStep[];

  /**
   * Optional output mapping description.
   * Intended for documentation; the actual shape is determined by
   * the extraction configs on each step.
   */
  output?: string;
}

/**
 * Input payload for executing a named recipe.
 */
export interface RecipeInput {
  /**
   * The recipe name (matches `Recipe.name`) or a path to a YAML
   * recipe definition file.
   */
  recipe: string;

  /**
   * Runtime parameter values keyed by `Recipe.params` names.
   * Missing keys fall back to default values declared in the recipe.
   */
  params: Record<string, string>;
}

/**
 * Result payload returned after executing a recipe.
 */
export interface RecipeResult {
  /** Whether all steps completed successfully. */
  success: boolean;

  /** Name of the recipe that was executed. */
  recipe: string;

  /**
   * Aggregated data from all recipe steps.
   * Keyed by step name; values are the per-step `ScrapeResult.data`
   * or `ScrapeResult.items` depending on the extraction mode.
   */
  data: Record<string, unknown>;

  /** Human-readable error message when `success` is `false`. */
  error?: string;
}
