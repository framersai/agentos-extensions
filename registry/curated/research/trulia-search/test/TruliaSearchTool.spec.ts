// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TruliaSearchTool } from '../src/TruliaSearchTool.js';

describe('TruliaSearchTool', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct tool metadata', () => {
    const tool = new TruliaSearchTool();
    expect(tool.id).toBe('trulia_search');
    expect(tool.name).toBe('trulia_search');
    expect(tool.parameters.required).toContain('location');
  });

  it('returns empty listings when no API keys configured', async () => {
    const tool = new TruliaSearchTool({ truliaRapidApiKey: undefined, firecrawlApiKey: undefined });
    const result = await tool.execute({ location: 'Austin, TX' });
    expect(result.listings).toEqual([]);
    expect(result.location).toBe('Austin, TX');
  });

  it('searches via RapidAPI when key is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { address: '123 Main St', price: 350000, bedrooms: 3, bathrooms: 2, sqft: 1500, url: 'https://trulia.com/p/1', propertyType: 'house' },
          { address: '456 Oak Ave', price: 420000, bedrooms: 4, bathrooms: 3, sqft: 2200, url: 'https://trulia.com/p/2', propertyType: 'house' },
        ],
        total: 2,
      }),
    });

    const tool = new TruliaSearchTool({ truliaRapidApiKey: 'test-key' });
    const result = await tool.execute({ location: 'Austin, TX', bedrooms: 3 });

    expect(result.listings.length).toBe(2);
    expect(result.listings[0].address).toBe('123 Main St');
    expect(result.listings[0].price).toBe(350000);
    expect(result.totalResults).toBe(2);
  });

  it('falls back to Firecrawl scrape when no RapidAPI key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: { markdown: 'Property 1 $250,000 3 bed\nProperty 2 $350,000 4 bed\nProperty 3 $450,000 5 bed' },
      }),
    });

    const tool = new TruliaSearchTool({ firecrawlApiKey: 'fc-key' });
    const result = await tool.execute({ location: 'Austin, TX', maxResults: 2 });

    expect(result.listings.length).toBe(2);
    expect(result.listings[0].price).toBe(250000);
    expect(result.listings[1].price).toBe(350000);
  });
});
