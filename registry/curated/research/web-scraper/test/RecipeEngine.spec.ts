/**
 * RecipeEngine — Unit Tests
 *
 * Verifies template interpolation (plain params, step data references, step
 * item references), recipe loading from the built-in recipes directory,
 * error handling for missing recipes and missing required params, and
 * multi-step execution with step data forwarding.
 *
 * The {@link WebScraperService} is mocked so no real HTTP calls are made.
 *
 * @module test/RecipeEngine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecipeEngine } from '../src/RecipeEngine.js';
import type { WebScraperService } from '../src/WebScraperService.js';

/* -------------------------------------------------------------------------- */
/*  Mock WebScraperService                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Create a minimal mock of WebScraperService that resolves with configurable
 * results per invocation.
 */
function createMockScraper(
  results: Array<{
    success: boolean;
    data?: Record<string, string>;
    items?: Record<string, string>[];
    text?: string;
    error?: string;
  }> = [],
): WebScraperService {
  let callIndex = 0;
  return {
    scrape: vi.fn().mockImplementation(async () => {
      const result = results[callIndex] ?? {
        success: true,
        url: 'https://mock.test',
        tier: 1,
        statusCode: 200,
        text: 'Default mock text',
      };
      callIndex++;
      return {
        url: 'https://mock.test',
        tier: 1,
        statusCode: 200,
        ...result,
      };
    }),
  } as unknown as WebScraperService;
}

/* -------------------------------------------------------------------------- */
/*  Template interpolation                                                    */
/* -------------------------------------------------------------------------- */

describe('RecipeEngine — template interpolation', () => {
  it('should interpolate {{param}} placeholders in step URLs', async () => {
    const mockScraper = createMockScraper([
      { success: true, text: 'result' },
    ]);
    const engine = new RecipeEngine(mockScraper);

    // Manually register a recipe (bypassing file loading)
    (engine as any).recipes.set('test-recipe', {
      name: 'test-recipe',
      description: 'Test',
      version: '1.0.0',
      params: { query: 'Search term' },
      steps: [
        {
          name: 'search',
          url: 'https://example.com/search?q={{query}}',
        },
      ],
    });

    await engine.execute({
      recipe: 'test-recipe',
      params: { query: 'hello world' },
    });

    const scrapeCall = (mockScraper.scrape as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(scrapeCall[0].url).toBe('https://example.com/search?q=hello world');
  });

  it('should interpolate {{steps.stepName.data.field}} from prior step results', async () => {
    const mockScraper = createMockScraper([
      { success: true, data: { url: 'https://example.com/detail/42' } },
      { success: true, text: 'Detail content' },
    ]);
    const engine = new RecipeEngine(mockScraper);

    (engine as any).recipes.set('chain-recipe', {
      name: 'chain-recipe',
      description: 'Test chained steps',
      version: '1.0.0',
      params: { query: 'Search term' },
      steps: [
        {
          name: 'search',
          url: 'https://example.com/search?q={{query}}',
          extract: { fields: { url: '.result-link @href' } },
        },
        {
          name: 'detail',
          url: '{{steps.search.data.url}}',
        },
      ],
    });

    await engine.execute({
      recipe: 'chain-recipe',
      params: { query: 'test' },
    });

    const secondCall = (mockScraper.scrape as ReturnType<typeof vi.fn>).mock.calls[1]!;
    expect(secondCall[0].url).toBe('https://example.com/detail/42');
  });

  it('should interpolate {{steps.stepName.items[N].field}} from prior step list results', async () => {
    const mockScraper = createMockScraper([
      {
        success: true,
        items: [
          { slug: 'first-item' },
          { slug: 'second-item' },
        ],
      },
      { success: true, text: 'Item detail' },
    ]);
    const engine = new RecipeEngine(mockScraper);

    (engine as any).recipes.set('list-recipe', {
      name: 'list-recipe',
      description: 'Test list item reference',
      version: '1.0.0',
      params: { query: 'Search' },
      steps: [
        {
          name: 'listing',
          url: 'https://example.com/list?q={{query}}',
          extract: { list: '.item', listFields: { slug: '.slug' } },
        },
        {
          name: 'detail',
          url: 'https://example.com/item/{{steps.listing.items[0].slug}}',
        },
      ],
    });

    await engine.execute({
      recipe: 'list-recipe',
      params: { query: 'test' },
    });

    const secondCall = (mockScraper.scrape as ReturnType<typeof vi.fn>).mock.calls[1]!;
    expect(secondCall[0].url).toBe('https://example.com/item/first-item');
  });
});

/* -------------------------------------------------------------------------- */
/*  Recipe loading from built-in recipes directory                            */
/* -------------------------------------------------------------------------- */

describe('RecipeEngine — recipe loading', () => {
  it('should load built-in recipes from the recipes/ directory', async () => {
    const mockScraper = createMockScraper();
    const engine = new RecipeEngine(mockScraper);

    await engine.loadRecipes();

    const names = engine.getRecipeNames();
    // The built-in recipes directory contains generic-article.yaml and
    // letterboxd-movie.yaml
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names).toContain('generic-article');
  });

  it('should retrieve a loaded recipe by name', async () => {
    const mockScraper = createMockScraper();
    const engine = new RecipeEngine(mockScraper);

    await engine.loadRecipes();

    const recipe = engine.getRecipe('generic-article');
    expect(recipe).toBeDefined();
    expect(recipe?.steps).toBeDefined();
    expect(recipe?.steps.length).toBeGreaterThanOrEqual(1);
  });

  it('should return undefined for a non-existent recipe name', async () => {
    const mockScraper = createMockScraper();
    const engine = new RecipeEngine(mockScraper);

    await engine.loadRecipes();

    const recipe = engine.getRecipe('does-not-exist');
    expect(recipe).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  Missing recipe error                                                      */
/* -------------------------------------------------------------------------- */

describe('RecipeEngine — error handling', () => {
  it('should return an error when executing a missing recipe', async () => {
    const mockScraper = createMockScraper();
    const engine = new RecipeEngine(mockScraper);

    const result = await engine.execute({
      recipe: 'nonexistent-recipe',
      params: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('nonexistent-recipe');
  });

  it('should return an error when a step fails during execution', async () => {
    const mockScraper = createMockScraper([
      { success: false, error: 'Connection refused' },
    ]);
    const engine = new RecipeEngine(mockScraper);

    (engine as any).recipes.set('fail-recipe', {
      name: 'fail-recipe',
      description: 'Test failure handling',
      version: '1.0.0',
      params: { url: 'Target URL' },
      steps: [
        {
          name: 'fetch',
          url: '{{url}}',
        },
      ],
    });

    const result = await engine.execute({
      recipe: 'fail-recipe',
      params: { url: 'https://unreachable.test' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Step "fetch" failed');
  });

  it('should use default param values when user params are missing', async () => {
    const mockScraper = createMockScraper([
      { success: true, text: 'page content' },
    ]);
    const engine = new RecipeEngine(mockScraper);

    (engine as any).recipes.set('default-params', {
      name: 'default-params',
      description: 'Test default params',
      version: '1.0.0',
      params: { query: 'Search term', page: '=1' },
      steps: [
        {
          name: 'search',
          url: 'https://example.com/search?q={{query}}&p={{page}}',
        },
      ],
    });

    await engine.execute({
      recipe: 'default-params',
      params: { query: 'test' },
    });

    const call = (mockScraper.scrape as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // page should have its default value "1"
    expect(call[0].url).toBe('https://example.com/search?q=test&p=1');
  });

  it('should resolve missing params without defaults to empty strings', async () => {
    const mockScraper = createMockScraper([
      { success: true, text: 'result' },
    ]);
    const engine = new RecipeEngine(mockScraper);

    (engine as any).recipes.set('missing-param', {
      name: 'missing-param',
      description: 'Test missing param fallback',
      version: '1.0.0',
      params: { query: 'Required search term' },
      steps: [
        {
          name: 'search',
          url: 'https://example.com/search?q={{query}}',
        },
      ],
    });

    await engine.execute({
      recipe: 'missing-param',
      params: {}, // query not provided, no default — should be empty string
    });

    const call = (mockScraper.scrape as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0].url).toBe('https://example.com/search?q=');
  });
});
