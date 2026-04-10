// @ts-nocheck
/**
 * @fileoverview Unit tests for MccCategoryMap.
 *
 * Tests cover: category resolution for all known ranges, boundary values,
 * unknown MCCs, reverse lookup (category → ranges/codes), and mapped categories.
 */

import { describe, it, expect } from 'vitest';
import { MccCategoryMap } from '../src/cards/MccCategoryMap.js';

describe('MccCategoryMap', () => {
  const map = new MccCategoryMap();

  /* ── mccToCategory ────────────────────────────────────────────────── */

  describe('mccToCategory', () => {
    it('should resolve dining MCCs (5812-5814)', () => {
      expect(map.mccToCategory('5812')).toBe('dining');
      expect(map.mccToCategory('5813')).toBe('dining');
      expect(map.mccToCategory('5814')).toBe('dining');
    });

    it('should resolve travel MCCs (airlines, hotels)', () => {
      expect(map.mccToCategory('3000')).toBe('travel');
      expect(map.mccToCategory('3500')).toBe('travel');
      expect(map.mccToCategory('3999')).toBe('travel');
      expect(map.mccToCategory('4511')).toBe('travel');
      expect(map.mccToCategory('7011')).toBe('travel');
      expect(map.mccToCategory('7012')).toBe('travel');
    });

    it('should resolve shopping MCCs (retail)', () => {
      expect(map.mccToCategory('5200')).toBe('shopping');
      expect(map.mccToCategory('5411')).toBe('shopping');
      expect(map.mccToCategory('5699')).toBe('shopping');
      expect(map.mccToCategory('5999')).toBe('shopping');
    });

    it('should resolve entertainment MCCs', () => {
      expect(map.mccToCategory('7832')).toBe('entertainment');
      expect(map.mccToCategory('7841')).toBe('entertainment');
      expect(map.mccToCategory('7941')).toBe('entertainment');
    });

    it('should resolve utilities MCCs (telecom, electric)', () => {
      expect(map.mccToCategory('4812')).toBe('utilities');
      expect(map.mccToCategory('4900')).toBe('utilities');
    });

    it('should resolve subscriptions MCCs (digital goods)', () => {
      expect(map.mccToCategory('5815')).toBe('subscriptions');
      expect(map.mccToCategory('5816')).toBe('subscriptions');
      expect(map.mccToCategory('5818')).toBe('subscriptions');
    });

    it('should resolve web_services MCCs (computer services)', () => {
      expect(map.mccToCategory('7372')).toBe('web_services');
      expect(map.mccToCategory('7379')).toBe('web_services');
    });

    it('should return "other" for unknown MCC', () => {
      expect(map.mccToCategory('0000')).toBe('other');
      expect(map.mccToCategory('9999')).toBe('other');
      expect(map.mccToCategory('1234')).toBe('other');
    });

    it('should return "other" for invalid MCC string', () => {
      expect(map.mccToCategory('abcd')).toBe('other');
      expect(map.mccToCategory('')).toBe('other');
    });

    it('should handle boundary values correctly', () => {
      // Just before travel range
      expect(map.mccToCategory('2999')).toBe('other');
      // First travel MCC
      expect(map.mccToCategory('3000')).toBe('travel');
      // Last travel MCC in range
      expect(map.mccToCategory('3999')).toBe('travel');
      // Just after travel range
      expect(map.mccToCategory('4000')).toBe('other');
    });
  });

  /* ── categoryToMccRanges ──────────────────────────────────────────── */

  describe('categoryToMccRanges', () => {
    it('should return ranges for dining', () => {
      const ranges = map.categoryToMccRanges('dining');
      expect(ranges.length).toBeGreaterThan(0);
      expect(ranges.some(r => r.min === 5812)).toBe(true);
    });

    it('should return multiple ranges for travel', () => {
      const ranges = map.categoryToMccRanges('travel');
      expect(ranges.length).toBeGreaterThan(1);
    });

    it('should return empty array for unmapped categories', () => {
      const ranges = map.categoryToMccRanges('defi');
      expect(ranges).toEqual([]);
    });

    it('should return empty array for api_costs (no MCC mapping)', () => {
      const ranges = map.categoryToMccRanges('api_costs');
      expect(ranges).toEqual([]);
    });
  });

  /* ── categoryToMccCodes ───────────────────────────────────────────── */

  describe('categoryToMccCodes', () => {
    it('should expand dining to individual codes', () => {
      const codes = map.categoryToMccCodes('dining');
      expect(codes).toContain('5812');
      expect(codes).toContain('5813');
      expect(codes).toContain('5814');
    });

    it('should pad codes to 4 digits', () => {
      const codes = map.categoryToMccCodes('dining');
      for (const code of codes) {
        expect(code.length).toBe(4);
      }
    });

    it('should return empty for unmapped categories', () => {
      expect(map.categoryToMccCodes('transfers')).toEqual([]);
    });
  });

  /* ── getMappedCategories ──────────────────────────────────────────── */

  describe('getMappedCategories', () => {
    it('should return all categories with MCC mappings', () => {
      const categories = map.getMappedCategories();
      expect(categories).toContain('dining');
      expect(categories).toContain('travel');
      expect(categories).toContain('shopping');
      expect(categories).toContain('entertainment');
      expect(categories).toContain('utilities');
      expect(categories).toContain('subscriptions');
      expect(categories).toContain('web_services');
    });

    it('should not include categories without MCC mappings', () => {
      const categories = map.getMappedCategories();
      expect(categories).not.toContain('defi');
      expect(categories).not.toContain('transfers');
      expect(categories).not.toContain('api_costs');
    });
  });
});
