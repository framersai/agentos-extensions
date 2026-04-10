// @ts-nocheck
/**
 * LetterboxdMovieTool — Unit Tests
 *
 * Verifies the tool's metadata (name, category, inputSchema), the built-in
 * fallback scraper with mocked fetch returning search results HTML and film
 * page HTML, and the `found: false` path when no search results match.
 *
 * All HTTP calls are mocked via `globalThis.fetch` — no real Letterboxd
 * requests are made.
 *
 * @module test/letterboxdMovie
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LetterboxdMovieTool } from '../src/tools/letterboxdMovie.js';

/* -------------------------------------------------------------------------- */
/*  Global fetch mock                                                         */
/* -------------------------------------------------------------------------- */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/*  Minimal ToolExecutionContext stub                                         */
/* -------------------------------------------------------------------------- */

/** Minimal context object satisfying the ToolExecutionContext interface. */
const stubContext = {
  agentId: 'test-agent',
  conversationId: 'test-conversation',
} as any;

/* -------------------------------------------------------------------------- */
/*  HTML fixtures                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Simulated Letterboxd search results page HTML containing a link to the
 * film "Arrival (2016)".
 */
const SEARCH_RESULTS_HTML = `
<!DOCTYPE html>
<html>
<head><title>Letterboxd - Search</title></head>
<body>
  <ul class="results">
    <li class="search-result">
      <a href="/film/arrival-2016/" class="film-poster">
        <img src="https://letterboxd.com/poster.jpg" alt="Arrival">
      </a>
      <span class="film-title-wrapper">
        <a href="/film/arrival-2016/">Arrival</a>
        <small class="metadata">2016</small>
      </span>
    </li>
    <li class="search-result">
      <a href="/film/arrival-1996/" class="film-poster">
        <img src="https://letterboxd.com/poster2.jpg" alt="Arrival">
      </a>
      <span class="film-title-wrapper">
        <a href="/film/arrival-1996/">The Arrival</a>
        <small class="metadata">1996</small>
      </span>
    </li>
  </ul>
</body>
</html>
`;

/**
 * Simulated Letterboxd film page HTML for "Arrival (2016)".
 */
const FILM_PAGE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Arrival (2016)">
  <meta property="og:description" content="A linguist is recruited by the military to communicate with alien lifeforms.">
  <meta name="twitter:data1" content="Denis Villeneuve">
  <meta name="twitter:data2" content="4.0 out of 5">
</head>
<body>
  <section id="featured-film-header">
    <h1 class="headline-1 filmtitle">Arrival</h1>
    <small class="number"><a href="/films/year/2016/">2016</a></small>
  </section>

  <div class="text-sluglist">
    <a class="text-slug" href="/films/genre/drama/">Drama</a>
    <a class="text-slug" href="/films/genre/science-fiction/">Science Fiction</a>
  </div>

  <div class="truncate"><p>A linguist is recruited by the military to communicate with alien lifeforms.</p></div>

  <ul class="film-details">
    <li class="film-detail">
      <a class="context" href="/johndoe/film/arrival-2016/">johndoe</a>
      <span class="rating rated-large-8">★★★★</span>
      <div class="body-text -micro"><p>Absolutely breathtaking.</p></div>
    </li>
    <li class="film-detail">
      <a class="context" href="/janedoe/film/arrival-2016/">janedoe</a>
      <span class="rating rated-large-9">★★★★½</span>
      <div class="body-text -micro"><p>One of the best sci-fi films ever made.</p></div>
    </li>
  </ul>

  <section id="crew-credits">
    <a href="/director/denis-villeneuve/">Denis Villeneuve</a>
  </section>
</body>
</html>
`;

/** Search results HTML with no film links (empty results). */
const EMPTY_SEARCH_HTML = `
<!DOCTYPE html>
<html>
<head><title>Letterboxd - Search</title></head>
<body>
  <div class="results">
    <p>There were no matches for your search term.</p>
  </div>
</body>
</html>
`;

/* -------------------------------------------------------------------------- */
/*  Tool metadata                                                             */
/* -------------------------------------------------------------------------- */

describe('LetterboxdMovieTool — metadata', () => {
  const tool = new LetterboxdMovieTool();

  it('should have the correct tool name', () => {
    expect(tool.name).toBe('letterboxd_movie');
  });

  it('should have the correct category', () => {
    expect(tool.category).toBe('media');
  });

  it('should define an inputSchema requiring "title"', () => {
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.properties).toBeDefined();
    expect((tool.inputSchema.properties as any).title).toBeDefined();
    expect((tool.inputSchema.properties as any).title.type).toBe('string');
    expect(tool.inputSchema.required).toContain('title');
  });

  it('should declare hasSideEffects as false', () => {
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should have an id, displayName, and version', () => {
    expect(tool.id).toBe('letterboxd-movie-v1');
    expect(tool.displayName).toBe('Letterboxd Movie Lookup');
    expect(tool.version).toBe('1.0.0');
  });
});

/* -------------------------------------------------------------------------- */
/*  Successful film lookup                                                    */
/* -------------------------------------------------------------------------- */

describe('LetterboxdMovieTool — built-in fallback scraper', () => {
  const tool = new LetterboxdMovieTool();

  it('should return found: true with film data from mocked HTML', async () => {
    // First fetch: search results page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => SEARCH_RESULTS_HTML,
    });

    // Second fetch: film detail page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => FILM_PAGE_HTML,
    });

    const result = await tool.execute({ title: 'Arrival', year: 2016 }, stubContext);

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.found).toBe(true);
    expect(result.output!.title).toBe('Arrival');
    expect(result.output!.year).toBe('2016');
    expect(result.output!.rating).toBe('4.0');
    expect(result.output!.directors).toBe('Denis Villeneuve');
    expect(result.output!.genres).toContain('Drama');
    expect(result.output!.genres).toContain('Science Fiction');
    expect(result.output!.synopsis).toContain('linguist');
  });

  it('should extract user reviews from the film page', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => SEARCH_RESULTS_HTML,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => FILM_PAGE_HTML,
    });

    const result = await tool.execute({ title: 'Arrival' }, stubContext);

    expect(result.output!.reviews).toBeDefined();
    expect(result.output!.reviews!.length).toBeGreaterThanOrEqual(1);

    const firstReview = result.output!.reviews![0]!;
    expect(firstReview.user).toBe('johndoe');
    expect(firstReview.text).toContain('breathtaking');
  });
});

/* -------------------------------------------------------------------------- */
/*  No search results                                                         */
/* -------------------------------------------------------------------------- */

describe('LetterboxdMovieTool — no results', () => {
  const tool = new LetterboxdMovieTool();

  it('should return found: false when no search results match and direct URL also fails', async () => {
    // Search returns empty results
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => EMPTY_SEARCH_HTML,
    });

    // Direct URL attempt also fails (404)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    const result = await tool.execute({ title: 'xyznonexistent123' }, stubContext);

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.found).toBe(false);
  });

  it('should return an error when title is empty', async () => {
    const result = await tool.execute({ title: '' }, stubContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('title');
  });

  it('should return found: false with error message when search is blocked by Cloudflare', async () => {
    // Search returns 403 (Cloudflare blocks)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    // Direct URL attempt also fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    const result = await tool.execute({ title: 'Arrival' }, stubContext);

    expect(result.success).toBe(true);
    expect(result.output!.found).toBe(false);
    expect(result.error).toContain('Cloudflare');
  });

  it('should fall back to direct URL when search fails and return film data', async () => {
    // Search returns 403 (Cloudflare)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    // Direct URL attempt succeeds (film detail pages bypass Cloudflare)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => FILM_PAGE_HTML,
    });

    const result = await tool.execute({ title: 'Arrival' }, stubContext);

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.found).toBe(true);
    expect(result.output!.title).toBe('Arrival');
    expect(result.output!.rating).toBe('4.0');
  });
});

/* -------------------------------------------------------------------------- */
/*  Argument validation                                                       */
/* -------------------------------------------------------------------------- */

describe('LetterboxdMovieTool — validateArgs', () => {
  const tool = new LetterboxdMovieTool();

  it('should pass validation with valid title', () => {
    const result = tool.validateArgs({ title: 'Arrival' });
    expect(result.isValid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should fail validation when title is missing', () => {
    const result = tool.validateArgs({});
    expect(result.isValid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('should fail validation when year is not an integer', () => {
    const result = tool.validateArgs({ title: 'Arrival', year: 2016.5 });
    expect(result.isValid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should pass validation with title and integer year', () => {
    const result = tool.validateArgs({ title: 'Arrival', year: 2016 });
    expect(result.isValid).toBe(true);
  });
});
