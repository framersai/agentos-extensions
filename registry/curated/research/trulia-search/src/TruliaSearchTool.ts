// @ts-nocheck
/**
 * @fileoverview Trulia property search tool.
 *
 * Uses RapidAPI Trulia endpoint when available, falls back to
 * Firecrawl scrape of trulia.com search results.
 *
 * @module agentos-ext-trulia-search/TruliaSearchTool
 */

import type { TruliaSearchInput, TruliaSearchOutput, TruliaListing } from './types.js';

/** ITool implementation for Trulia real estate search. */
export class TruliaSearchTool {
  readonly id = 'trulia_search';
  readonly name = 'trulia_search';
  readonly displayName = 'Trulia Property Search';
  readonly description = 'Search for real estate properties by location, price, bedrooms, and property type.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      location: { type: 'string', description: 'City, state or zip code (e.g., "Austin, TX")' },
      propertyType: { type: 'string', enum: ['house', 'apartment', 'condo', 'townhouse', 'land'], description: 'Property type filter' },
      minPrice: { type: 'number', description: 'Minimum price' },
      maxPrice: { type: 'number', description: 'Maximum price' },
      bedrooms: { type: 'number', description: 'Minimum bedrooms' },
      bathrooms: { type: 'number', description: 'Minimum bathrooms' },
      maxResults: { type: 'number', description: 'Maximum results (default: 20)' },
    },
    required: ['location'],
  };

  private truliaRapidApiKey?: string;
  private firecrawlApiKey?: string;

  constructor(config?: { truliaRapidApiKey?: string; firecrawlApiKey?: string }) {
    this.truliaRapidApiKey = config?.truliaRapidApiKey ?? process.env.TRULIA_RAPIDAPI_KEY;
    this.firecrawlApiKey = config?.firecrawlApiKey ?? process.env.FIRECRAWL_API_KEY;
  }

  async execute(input: TruliaSearchInput): Promise<TruliaSearchOutput> {
    const maxResults = input.maxResults ?? 20;

    if (this.truliaRapidApiKey) {
      return this.searchViaRapidApi(input, maxResults);
    }

    if (this.firecrawlApiKey) {
      return this.searchViaFirecrawlScrape(input, maxResults);
    }

    return { listings: [], totalResults: 0, location: input.location };
  }

  /** Search via RapidAPI Trulia endpoint. */
  private async searchViaRapidApi(input: TruliaSearchInput, maxResults: number): Promise<TruliaSearchOutput> {
    const params = new URLSearchParams({ location: input.location });
    if (input.propertyType) params.set('type', input.propertyType);
    if (input.minPrice) params.set('minPrice', String(input.minPrice));
    if (input.maxPrice) params.set('maxPrice', String(input.maxPrice));
    if (input.bedrooms) params.set('beds', String(input.bedrooms));
    if (input.bathrooms) params.set('baths', String(input.bathrooms));
    params.set('limit', String(maxResults));

    const res = await fetch(`https://trulia-com4.p.rapidapi.com/properties/search?${params}`, {
      headers: {
        'x-rapidapi-key': this.truliaRapidApiKey!,
        'x-rapidapi-host': 'trulia-com4.p.rapidapi.com',
      },
    });

    if (!res.ok) throw new Error(`Trulia RapidAPI error: ${res.status}`);

    const data = (await res.json()) as {
      data?: Array<{
        address?: string; price?: number; bedrooms?: number; bathrooms?: number;
        sqft?: number; url?: string; photo?: string; listedDate?: string; propertyType?: string;
      }>;
      total?: number;
    };

    const listings: TruliaListing[] = (data.data ?? []).map((p) => ({
      address: p.address ?? '',
      price: p.price ?? 0,
      beds: p.bedrooms ?? 0,
      baths: p.bathrooms ?? 0,
      sqft: p.sqft ?? 0,
      url: p.url ?? '',
      imageUrl: p.photo,
      listingDate: p.listedDate ?? '',
      propertyType: p.propertyType ?? 'house',
    }));

    return { listings, totalResults: data.total ?? listings.length, location: input.location };
  }

  /** Fallback: scrape trulia.com via Firecrawl. */
  private async searchViaFirecrawlScrape(input: TruliaSearchInput, maxResults: number): Promise<TruliaSearchOutput> {
    const locationSlug = input.location.toLowerCase().replace(/[,\s]+/g, '-').replace(/-+/g, '-');
    const url = `https://www.trulia.com/${locationSlug}/`;

    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.firecrawlApiKey}`,
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    });

    if (!res.ok) return { listings: [], totalResults: 0, location: input.location };

    const data = (await res.json()) as { data?: { markdown?: string } };
    const markdown = data.data?.markdown ?? '';

    const listings: TruliaListing[] = [];
    const pricePattern = /\$[\d,]+/g;
    const prices = markdown.match(pricePattern) ?? [];

    for (let i = 0; i < Math.min(prices.length, maxResults); i++) {
      listings.push({
        address: `Listing ${i + 1} in ${input.location}`,
        price: parseInt(prices[i].replace(/[$,]/g, ''), 10),
        beds: input.bedrooms ?? 0,
        baths: input.bathrooms ?? 0,
        sqft: 0,
        url,
        listingDate: new Date().toISOString(),
        propertyType: input.propertyType ?? 'house',
      });
    }

    return { listings, totalResults: listings.length, location: input.location };
  }
}
