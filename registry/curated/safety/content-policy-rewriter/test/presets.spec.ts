// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { resolvePreset } from '../src/presets.js';

describe('presets', () => {
  it('uncensored disables all categories', () => {
    const cfg = resolvePreset('uncensored');
    for (const cat of Object.values(cfg.categories ?? {})) {
      expect(cat?.enabled).toBe(false);
    }
  });

  it('uncensored-safe enables only illegal_harmful', () => {
    const cfg = resolvePreset('uncensored-safe');
    expect(cfg.categories?.illegal_harmful?.enabled).toBe(true);
    expect(cfg.categories?.adult?.enabled).toBeUndefined();
  });

  it('family-friendly enables all categories', () => {
    const cfg = resolvePreset('family-friendly');
    expect(cfg.categories?.adult?.enabled).toBe(true);
    expect(cfg.categories?.profanity?.enabled).toBe(true);
    expect(cfg.categories?.violence?.enabled).toBe(true);
  });

  it('passes through config objects unchanged', () => {
    const input = { categories: { adult: { enabled: true } } };
    const cfg = resolvePreset(input);
    expect(cfg).toEqual(input);
  });
});
