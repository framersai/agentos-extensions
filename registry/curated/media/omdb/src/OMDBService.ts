/**
 * OMDBService — lightweight wrapper around the Open Movie Database (OMDB) API.
 *
 * Handles authentication, request construction, and response normalization
 * for both search and detail endpoints.
 *
 * @see https://www.omdbapi.com/ for API documentation
 */

/** Options for narrowing a title search. */
export interface OMDBSearchOptions {
  /** Restrict results to a specific release year. */
  year?: number;
  /** Restrict results to a specific media type. */
  type?: 'movie' | 'series' | 'episode';
  /** Page number of results to return (1-based, 10 results per page). */
  page?: number;
}

/** A single search result returned by the OMDB search endpoint. */
export interface OMDBSearchResult {
  /** Title of the movie, series, or episode. */
  title: string;
  /** Release year (may be a range for series, e.g. "2008-2013"). */
  year: string;
  /** IMDB identifier (e.g. "tt1234567"). */
  imdbID: string;
  /** Media type: movie, series, or episode. */
  type: string;
  /** URL to the poster image, or "N/A" if unavailable. */
  poster: string;
}

/** Aggregated search response from the OMDB search endpoint. */
export interface OMDBSearchResponse {
  /** Array of matching titles. */
  results: OMDBSearchResult[];
  /** Total number of results available (across all pages). */
  totalResults: number;
}

/** Options for fetching detailed information about a single title. */
export interface OMDBDetailsOptions {
  /** IMDB identifier (e.g. "tt1234567"). Takes precedence over title. */
  imdbId?: string;
  /** Title to search for. Used when imdbId is not provided. */
  title?: string;
  /** Restrict match to a specific release year. */
  year?: number;
  /** Length of the plot summary to return. */
  plot?: 'short' | 'full';
}

/** A single rating from a review aggregator. */
export interface OMDBRating {
  /** Rating source (e.g. "Internet Movie Database", "Rotten Tomatoes", "Metacritic"). */
  source: string;
  /** Rating value (format varies by source, e.g. "8.5/10", "92%", "85/100"). */
  value: string;
}

/** Full detail response from the OMDB detail endpoint. */
export interface OMDBDetailsResponse {
  /** Title of the movie, series, or episode. */
  title: string;
  /** Release year (may be a range for series). */
  year: string;
  /** MPAA or equivalent content rating (e.g. "PG-13", "R", "TV-MA"). */
  rated: string;
  /** Release date string (e.g. "18 Jul 2008"). */
  released: string;
  /** Runtime (e.g. "152 min"). */
  runtime: string;
  /** Comma-separated list of genres. */
  genres: string;
  /** Director name(s). */
  director: string;
  /** Writer credit(s). */
  writers: string;
  /** Lead actors. */
  actors: string;
  /** Plot summary (length determined by the plot option). */
  plot: string;
  /** Language(s). */
  language: string;
  /** Country of origin. */
  country: string;
  /** Awards summary string. */
  awards: string;
  /** URL to the poster image, or "N/A" if unavailable. */
  poster: string;
  /** Ratings from IMDB, Rotten Tomatoes, and Metacritic. */
  ratings: OMDBRating[];
  /** Metacritic score as a string (e.g. "82"), or "N/A". */
  metascore: string;
  /** IMDB rating as a string (e.g. "9.0"), or "N/A". */
  imdbRating: string;
  /** Number of IMDB votes as a formatted string (e.g. "2,345,678"). */
  imdbVotes: string;
  /** IMDB identifier. */
  imdbID: string;
  /** Media type: movie, series, or episode. */
  type: string;
  /** Box office earnings string (e.g. "$533,316,061"), or "N/A". */
  boxOffice: string;
}

/**
 * Service class that wraps the OMDB REST API.
 *
 * @example
 * ```ts
 * const svc = new OMDBService('your-api-key');
 * const results = await svc.search('Inception');
 * const details = await svc.details({ imdbId: 'tt1375666' });
 * ```
 */
export class OMDBService {
  /** Base URL for all OMDB API requests. */
  private static readonly BASE_URL = 'http://www.omdbapi.com/';

  /** The API key used for authentication. */
  private readonly apiKey: string;

  /**
   * Creates a new OMDBService instance.
   *
   * @param apiKey - OMDB API key. Obtain one at https://www.omdbapi.com/apikey.aspx
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search for movies, TV shows, or episodes by title.
   *
   * Uses the OMDB `?s=` search endpoint which returns paginated results
   * (10 per page).
   *
   * @param query - Title search string
   * @param opts  - Optional filters (year, type, page)
   * @returns Search response with results array and total count
   * @throws Error when the OMDB API returns an HTTP error or an error message
   */
  async search(query: string, opts?: OMDBSearchOptions): Promise<OMDBSearchResponse> {
    const params = new URLSearchParams({
      apikey: this.apiKey,
      s: query,
    });

    if (opts?.year) params.set('y', String(opts.year));
    if (opts?.type) params.set('type', opts.type);
    if (opts?.page) params.set('page', String(opts.page));

    const response = await fetch(`${OMDBService.BASE_URL}?${params}`);

    if (!response.ok) {
      throw new Error(`OMDB API HTTP error (${response.status})`);
    }

    const data = (await response.json()) as any;

    if (data.Response !== 'True') {
      throw new Error(data.Error || 'OMDB search returned no results');
    }

    const results: OMDBSearchResult[] = (data.Search || []).map((item: any) => ({
      title: item.Title || '',
      year: item.Year || '',
      imdbID: item.imdbID || '',
      type: item.Type || '',
      poster: item.Poster || 'N/A',
    }));

    return {
      results,
      totalResults: parseInt(data.totalResults || '0', 10),
    };
  }

  /**
   * Fetch full details for a single title by IMDB ID or title string.
   *
   * Uses the OMDB `?i=` (by IMDB ID) or `?t=` (by title) endpoint.
   * When both `imdbId` and `title` are provided, `imdbId` takes precedence.
   *
   * @param opts - Lookup options (at least one of imdbId or title required)
   * @returns Complete movie/show data including ratings from multiple sources
   * @throws Error when neither imdbId nor title is provided, or when the API returns an error
   */
  async details(opts: OMDBDetailsOptions): Promise<OMDBDetailsResponse> {
    if (!opts.imdbId && !opts.title) {
      throw new Error('Either imdbId or title must be provided');
    }

    const params = new URLSearchParams({
      apikey: this.apiKey,
    });

    if (opts.imdbId) {
      params.set('i', opts.imdbId);
    } else if (opts.title) {
      params.set('t', opts.title);
    }

    if (opts.year) params.set('y', String(opts.year));
    if (opts.plot) params.set('plot', opts.plot);

    const response = await fetch(`${OMDBService.BASE_URL}?${params}`);

    if (!response.ok) {
      throw new Error(`OMDB API HTTP error (${response.status})`);
    }

    const data = (await response.json()) as any;

    if (data.Response !== 'True') {
      throw new Error(data.Error || 'OMDB details lookup failed');
    }

    const ratings: OMDBRating[] = (data.Ratings || []).map((r: any) => ({
      source: r.Source || '',
      value: r.Value || '',
    }));

    return {
      title: data.Title || '',
      year: data.Year || '',
      rated: data.Rated || 'N/A',
      released: data.Released || 'N/A',
      runtime: data.Runtime || 'N/A',
      genres: data.Genre || 'N/A',
      director: data.Director || 'N/A',
      writers: data.Writer || 'N/A',
      actors: data.Actors || 'N/A',
      plot: data.Plot || 'N/A',
      language: data.Language || 'N/A',
      country: data.Country || 'N/A',
      awards: data.Awards || 'N/A',
      poster: data.Poster || 'N/A',
      ratings,
      metascore: data.Metascore || 'N/A',
      imdbRating: data.imdbRating || 'N/A',
      imdbVotes: data.imdbVotes || 'N/A',
      imdbID: data.imdbID || '',
      type: data.Type || '',
      boxOffice: data.BoxOffice || 'N/A',
    };
  }
}
