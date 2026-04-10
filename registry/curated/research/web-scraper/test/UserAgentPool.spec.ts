// @ts-nocheck
/**
 * UserAgentPool — Unit Tests
 *
 * Verifies that the programmatic UA generator returns realistic browser
 * User-Agent strings, includes expected browser-like HTTP headers, and
 * produces sufficiently varied output across multiple invocations.
 *
 * @module test/UserAgentPool
 */

import { describe, it, expect } from 'vitest';
import { randomUserAgent, browserHeaders } from '../src/UserAgentPool.js';

/* -------------------------------------------------------------------------- */
/*  randomUserAgent()                                                         */
/* -------------------------------------------------------------------------- */

describe('randomUserAgent()', () => {
  it('should return a non-empty string', () => {
    const ua = randomUserAgent();
    expect(typeof ua).toBe('string');
    expect(ua.length).toBeGreaterThan(0);
  });

  it('should start with "Mozilla/5.0"', () => {
    const ua = randomUserAgent();
    expect(ua).toMatch(/^Mozilla\/5\.0/);
  });

  it('should contain a recognized browser identifier', () => {
    const ua = randomUserAgent();
    // Every generated UA should contain at least one of these browser tokens
    const hasBrowser =
      ua.includes('Chrome/') ||
      ua.includes('Firefox/') ||
      ua.includes('Safari/') ||
      ua.includes('Edg/');
    expect(hasBrowser).toBe(true);
  });

  it('should contain an OS platform identifier', () => {
    const ua = randomUserAgent();
    const hasPlatform =
      ua.includes('Windows NT') ||
      ua.includes('Macintosh') ||
      ua.includes('Linux');
    expect(hasPlatform).toBe(true);
  });

  it('should produce varied UAs across 10 calls (not all identical)', () => {
    const uas = new Set<string>();
    for (let i = 0; i < 10; i++) {
      uas.add(randomUserAgent());
    }
    // With version randomization + platform randomization, getting 10
    // identical UAs in a row is astronomically unlikely
    expect(uas.size).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  browserHeaders()                                                          */
/* -------------------------------------------------------------------------- */

describe('browserHeaders()', () => {
  it('should include a User-Agent header', () => {
    const headers = browserHeaders();
    expect(headers['User-Agent']).toBeDefined();
    expect(headers['User-Agent']!.length).toBeGreaterThan(0);
  });

  it('should include Accept header', () => {
    const headers = browserHeaders();
    expect(headers['Accept']).toBeDefined();
    expect(headers['Accept']).toContain('text/html');
  });

  it('should include Accept-Language header', () => {
    const headers = browserHeaders();
    expect(headers['Accept-Language']).toBeDefined();
    expect(headers['Accept-Language']).toContain('en');
  });

  it('should include Accept-Encoding header', () => {
    const headers = browserHeaders();
    expect(headers['Accept-Encoding']).toBeDefined();
  });

  it('should use the provided UA override', () => {
    const customUA = 'Custom-UA/1.0';
    const headers = browserHeaders(customUA);
    expect(headers['User-Agent']).toBe(customUA);
  });

  it('should include Sec-Fetch-Dest for Chrome UAs', () => {
    // Force a Chrome UA to ensure Sec-Fetch headers are present
    const chromeUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const headers = browserHeaders(chromeUA);
    expect(headers['Sec-Fetch-Dest']).toBe('document');
    expect(headers['Sec-Fetch-Mode']).toBe('navigate');
    expect(headers['Sec-Fetch-User']).toBe('?1');
  });

  it('should include Sec-CH-UA client hints for Chrome UAs', () => {
    const chromeUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const headers = browserHeaders(chromeUA);
    expect(headers['Sec-CH-UA']).toBeDefined();
    expect(headers['Sec-CH-UA']).toContain('Google Chrome');
    expect(headers['Sec-CH-UA-Mobile']).toBe('?0');
  });

  it('should omit Sec-Fetch-* headers for Firefox UAs', () => {
    const firefoxUA =
      'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0';
    const headers = browserHeaders(firefoxUA);
    expect(headers['Sec-Fetch-Dest']).toBeUndefined();
    expect(headers['Sec-CH-UA']).toBeUndefined();
  });

  it('should set Sec-CH-UA for Edge UAs with Microsoft Edge branding', () => {
    const edgeUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
    const headers = browserHeaders(edgeUA);
    expect(headers['Sec-CH-UA']).toBeDefined();
    expect(headers['Sec-CH-UA']).toContain('Microsoft Edge');
  });
});
