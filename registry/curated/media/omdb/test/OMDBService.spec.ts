// @ts-nocheck
/**
 * OMDBService — Unit Tests
 *
 * Verifies the OMDB API wrapper's search and details methods, including
 * successful response parsing, error handling for "Response: False" payloads,
 * null-movie detection, and multi-source ratings array normalization.
 *
 * All HTTP calls are mocked via `globalThis.fetch` — no real OMDB API
 * requests are made.
 *
 * @module test/OMDBService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OMDBService } from '../src/OMDBService.js';

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
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Build a mock OMDB search API response with the given search results.
 *
 * @param results - Array of raw OMDB Search result objects.
 * @param total   - Total results count string.
 * @returns A mock Response-like object suitable for `mockFetch.mockResolvedValue`.
 */
function mockSearchResponse(
  results: Array<Record<string, string>>,
  total: string,
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      Search: results,
      totalResults: total,
      Response: 'True',
    }),
  };
}

/**
 * Build a mock OMDB details API response with full movie data.
 *
 * @param data - Partial movie data to merge with defaults.
 * @returns A mock Response-like object.
 */
function mockDetailsResponse(data: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      Response: 'True',
      Title: 'Inception',
      Year: '2010',
      Rated: 'PG-13',
      Released: '16 Jul 2010',
      Runtime: '148 min',
      Genre: 'Action, Adventure, Sci-Fi',
      Director: 'Christopher Nolan',
      Writer: 'Christopher Nolan',
      Actors: 'Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page',
      Plot: 'A thief who steals corporate secrets through dream-sharing technology.',
      Language: 'English',
      Country: 'United States, United Kingdom',
      Awards: 'Won 4 Oscars.',
      Poster: 'https://example.com/inception.jpg',
      Ratings: [],
      Metascore: '74',
      imdbRating: '8.8',
      imdbVotes: '2,345,678',
      imdbID: 'tt1375666',
      Type: 'movie',
      BoxOffice: '$292,576,195',
      ...data,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/*  search()                                                                  */
/* -------------------------------------------------------------------------- */

describe('OMDBService.search()', () => {
  const svc = new OMDBService('test-api-key');

  it('should return parsed search results on success', async () => {
    mockFetch.mockResolvedValueOnce(
      mockSearchResponse(
        [
          { Title: 'Inception', Year: '2010', imdbID: 'tt1375666', Type: 'movie', Poster: 'https://example.com/poster.jpg' },
          { Title: 'Interstellar', Year: '2014', imdbID: 'tt0816692', Type: 'movie', Poster: 'N/A' },
        ],
        '2',
      ),
    );

    const response = await svc.search('Inception');

    expect(response.results).toHaveLength(2);
    expect(response.totalResults).toBe(2);
    expect(response.results[0]!.title).toBe('Inception');
    expect(response.results[0]!.year).toBe('2010');
    expect(response.results[0]!.imdbID).toBe('tt1375666');
    expect(response.results[0]!.type).toBe('movie');
    expect(response.results[0]!.poster).toBe('https://example.com/poster.jpg');
    expect(response.results[1]!.title).toBe('Interstellar');
  });

  it('should throw an error when Response is "False"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        Response: 'False',
        Error: 'Movie not found!',
      }),
    });

    await expect(svc.search('xyznonexistent123')).rejects.toThrow('Movie not found!');
  });

  it('should throw on HTTP error status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(svc.search('test')).rejects.toThrow('OMDB API HTTP error (500)');
  });

  it('should pass optional search parameters', async () => {
    mockFetch.mockResolvedValueOnce(
      mockSearchResponse(
        [{ Title: 'The Office', Year: '2005-2013', imdbID: 'tt0386676', Type: 'series', Poster: 'N/A' }],
        '1',
      ),
    );

    await svc.search('The Office', { year: 2005, type: 'series', page: 1 });

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('y=2005');
    expect(calledUrl).toContain('type=series');
    expect(calledUrl).toContain('page=1');
  });
});

/* -------------------------------------------------------------------------- */
/*  details()                                                                 */
/* -------------------------------------------------------------------------- */

describe('OMDBService.details()', () => {
  const svc = new OMDBService('test-api-key');

  it('should return full movie data with mocked fetch', async () => {
    mockFetch.mockResolvedValueOnce(
      mockDetailsResponse({
        Title: 'The Dark Knight',
        Year: '2008',
        imdbID: 'tt0468569',
        Type: 'movie',
        Director: 'Christopher Nolan',
        Runtime: '152 min',
        BoxOffice: '$533,316,061',
      }),
    );

    const details = await svc.details({ imdbId: 'tt0468569' });

    expect(details.title).toBe('The Dark Knight');
    expect(details.year).toBe('2008');
    expect(details.imdbID).toBe('tt0468569');
    expect(details.director).toBe('Christopher Nolan');
    expect(details.runtime).toBe('152 min');
    expect(details.boxOffice).toBe('$533,316,061');
    expect(details.type).toBe('movie');
  });

  it('should throw when the movie is not found (Response: False)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        Response: 'False',
        Error: 'Incorrect IMDb ID.',
      }),
    });

    await expect(svc.details({ imdbId: 'tt9999999' })).rejects.toThrow('Incorrect IMDb ID.');
  });

  it('should throw when neither imdbId nor title is provided', async () => {
    await expect(svc.details({})).rejects.toThrow('Either imdbId or title must be provided');
  });

  it('should use title param when imdbId is not provided', async () => {
    mockFetch.mockResolvedValueOnce(
      mockDetailsResponse({ Title: 'Arrival', Year: '2016' }),
    );

    await svc.details({ title: 'Arrival' });

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('t=Arrival');
    expect(calledUrl).not.toContain('i=');
  });

  it('should parse the ratings array with IMDB, Rotten Tomatoes, and Metacritic sources', async () => {
    mockFetch.mockResolvedValueOnce(
      mockDetailsResponse({
        Ratings: [
          { Source: 'Internet Movie Database', Value: '8.8/10' },
          { Source: 'Rotten Tomatoes', Value: '87%' },
          { Source: 'Metacritic', Value: '74/100' },
        ],
      }),
    );

    const details = await svc.details({ imdbId: 'tt1375666' });

    expect(details.ratings).toHaveLength(3);
    expect(details.ratings[0]!.source).toBe('Internet Movie Database');
    expect(details.ratings[0]!.value).toBe('8.8/10');
    expect(details.ratings[1]!.source).toBe('Rotten Tomatoes');
    expect(details.ratings[1]!.value).toBe('87%');
    expect(details.ratings[2]!.source).toBe('Metacritic');
    expect(details.ratings[2]!.value).toBe('74/100');
  });

  it('should handle missing Ratings gracefully (empty array)', async () => {
    mockFetch.mockResolvedValueOnce(
      mockDetailsResponse({ Ratings: undefined }),
    );

    const details = await svc.details({ imdbId: 'tt1375666' });
    expect(details.ratings).toEqual([]);
  });

  it('should default N/A fields properly', async () => {
    mockFetch.mockResolvedValueOnce(
      mockDetailsResponse({
        Rated: undefined,
        Runtime: undefined,
        Awards: undefined,
        BoxOffice: undefined,
        Metascore: undefined,
        imdbRating: undefined,
      }),
    );

    const details = await svc.details({ imdbId: 'tt1375666' });
    expect(details.rated).toBe('N/A');
    expect(details.runtime).toBe('N/A');
    expect(details.awards).toBe('N/A');
    expect(details.boxOffice).toBe('N/A');
    expect(details.metascore).toBe('N/A');
    expect(details.imdbRating).toBe('N/A');
  });
});
