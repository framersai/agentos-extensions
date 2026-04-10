// @ts-nocheck
/**
 * @fileoverview Types for the Trulia real estate search extension.
 * @module agentos-ext-trulia-search/types
 */

/** Input for trulia_search tool. */
export interface TruliaSearchInput {
  location: string;
  propertyType?: 'house' | 'apartment' | 'condo' | 'townhouse' | 'land';
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  maxResults?: number;
}

/** A single property listing. */
export interface TruliaListing {
  address: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  url: string;
  imageUrl?: string;
  listingDate: string;
  propertyType: string;
}

/** Output of trulia_search. */
export interface TruliaSearchOutput {
  listings: TruliaListing[];
  totalResults: number;
  location: string;
}
