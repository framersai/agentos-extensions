// @ts-nocheck
/**
 * @fileoverview Merchant Category Code (MCC) → SpendCategory mapping.
 *
 * Maps 4-digit MCC codes used by card networks to the wallet extension's
 * SpendCategory enum. Uses range-based matching for efficient lookup.
 *
 * @module wallet/cards/MccCategoryMap
 */

import type { SpendCategory } from '../types.js';

// ---------------------------------------------------------------------------
// MCC range definitions
// ---------------------------------------------------------------------------

interface MccRange {
  min: number;
  max: number;
  category: SpendCategory;
}

/**
 * Ordered list of MCC ranges → SpendCategory mappings.
 * Ranges are inclusive on both ends.
 */
const MCC_RANGES: MccRange[] = [
  // Travel: airlines, hotels, rental cars, travel agencies
  { min: 3000, max: 3999, category: 'travel' },
  { min: 4511, max: 4511, category: 'travel' },   // airlines
  { min: 4722, max: 4722, category: 'travel' },   // travel agencies
  { min: 7011, max: 7012, category: 'travel' },   // hotels, timeshares
  { min: 7033, max: 7033, category: 'travel' },   // trailer parks
  { min: 7512, max: 7519, category: 'travel' },   // car rental

  // Utilities: telecom, electric, gas, water
  { min: 4812, max: 4816, category: 'utilities' }, // telecom
  { min: 4899, max: 4900, category: 'utilities' }, // cable, electric/gas/water

  // Shopping: general retail
  { min: 5200, max: 5499, category: 'shopping' },  // home supply, dept stores
  { min: 5511, max: 5599, category: 'shopping' },  // auto dealers, auto parts
  { min: 5600, max: 5699, category: 'shopping' },  // apparel
  { min: 5700, max: 5799, category: 'shopping' },  // furniture, electronics
  { min: 5900, max: 5999, category: 'shopping' },  // retail stores, misc

  // Dining: restaurants, bars, fast food
  { min: 5811, max: 5811, category: 'dining' },    // caterers
  { min: 5812, max: 5812, category: 'dining' },    // eating places/restaurants
  { min: 5813, max: 5813, category: 'dining' },    // bars/taverns
  { min: 5814, max: 5814, category: 'dining' },    // fast food

  // Subscriptions: digital goods/services
  { min: 5815, max: 5818, category: 'subscriptions' }, // digital goods, games, apps, streaming

  // Entertainment: movies, theaters, events, recreation
  { min: 7832, max: 7833, category: 'entertainment' }, // movie theaters
  { min: 7841, max: 7841, category: 'entertainment' }, // video tape rental
  { min: 7911, max: 7911, category: 'entertainment' }, // dance halls/studios
  { min: 7922, max: 7922, category: 'entertainment' }, // theatrical producers
  { min: 7929, max: 7929, category: 'entertainment' }, // bands/orchestras
  { min: 7932, max: 7933, category: 'entertainment' }, // billiards, bowling
  { min: 7941, max: 7941, category: 'entertainment' }, // sports clubs/fields
  { min: 7991, max: 7999, category: 'entertainment' }, // tourist attractions, recreation

  // Web services: computer programming, data processing, IT
  { min: 7372, max: 7379, category: 'web_services' }, // computer services
  { min: 4816, max: 4816, category: 'web_services' }, // computer network/info services (re-mapped from utilities for precision)

  // API costs: SaaS / cloud compute (commonly billed under computer services)
  // Note: most SaaS bills under 7372 (web_services). If needed, specific
  // merchant descriptors can override at the CardManager level.
];

// ---------------------------------------------------------------------------
// Lookup class
// ---------------------------------------------------------------------------

export class MccCategoryMap {
  private readonly ranges: MccRange[];

  constructor() {
    // Sort by min for binary-search-friendly access
    this.ranges = [...MCC_RANGES].sort((a, b) => a.min - b.min);
  }

  /**
   * Resolve a 4-digit MCC string to a SpendCategory.
   * Returns 'other' if no matching range is found.
   */
  mccToCategory(mcc: string): SpendCategory {
    const code = parseInt(mcc, 10);
    if (isNaN(code)) return 'other';

    for (const range of this.ranges) {
      if (code >= range.min && code <= range.max) {
        return range.category;
      }
    }
    return 'other';
  }

  /**
   * Get all MCC ranges that map to a given SpendCategory.
   * Useful for building Lithic auth rules.
   */
  categoryToMccRanges(category: SpendCategory): Array<{ min: number; max: number }> {
    return this.ranges
      .filter(r => r.category === category)
      .map(({ min, max }) => ({ min, max }));
  }

  /**
   * Get all individual MCC codes for a category (expands ranges).
   * Useful for Lithic's blocked_mcc list which expects individual codes.
   */
  categoryToMccCodes(category: SpendCategory): string[] {
    const codes: string[] = [];
    for (const range of this.ranges) {
      if (range.category !== category) continue;
      for (let code = range.min; code <= range.max; code++) {
        codes.push(code.toString().padStart(4, '0'));
      }
    }
    return codes;
  }

  /**
   * Get all categories that have MCC mappings.
   */
  getMappedCategories(): SpendCategory[] {
    const categories = new Set<SpendCategory>();
    for (const range of this.ranges) {
      categories.add(range.category);
    }
    return [...categories];
  }
}
