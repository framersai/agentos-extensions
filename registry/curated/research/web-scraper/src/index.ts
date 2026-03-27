/**
 * Web Scraper Extension Pack — intelligent web scraping with progressive
 * fallbacks, proxy rotation, and LLM-assisted extraction.
 *
 * Provides two tools:
 * - `web_scrape` — scrape and extract structured data from a single URL
 * - `web_scrape_recipe` — execute named multi-step scraping recipes
 *
 * @packageDocumentation
 */

export { WebScraperService } from './WebScraperService.js';
export type { WebScraperServiceOptions } from './WebScraperService.js';
export { randomUserAgent, browserHeaders } from './UserAgentPool.js';
export type {
  ScrapeInput,
  ScrapeResult,
  ScrapeOptions,
  ScrapeTier,
  ExtractConfig,
  RecipeStep,
  Recipe,
  RecipeInput,
  RecipeResult,
} from './types.js';
