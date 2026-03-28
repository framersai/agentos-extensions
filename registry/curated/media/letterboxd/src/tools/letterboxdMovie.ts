/**
 * Letterboxd Movie Lookup Tool — ITool implementation for Letterboxd scraping.
 *
 * Retrieves film metadata, aggregate ratings, director credits, genre tags,
 * a synopsis, and a sample of recent reviews from Letterboxd.  Uses a
 * two-strategy approach:
 *
 * 1. **Recipe delegation** — if a `web_scrape_recipe` tool reference is
 *    provided at construction time, the tool delegates to the web-scraper
 *    extension's recipe engine for robust, tiered scraping.
 * 2. **Built-in fallback** — a lightweight `fetch()`-based scraper that
 *    parses Letterboxd HTML via regex.  No API key or headless browser
 *    required; works out of the box for most films.
 *
 * @module tools/letterboxdMovie
 */

import type {
  ITool,
  ToolExecutionContext,
  ToolExecutionResult,
  JSONSchemaObject,
} from '@framers/agentos';

/* -------------------------------------------------------------------------- */
/*  Public Types                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Input parameters for the `letterboxd_movie` tool.
 */
export interface LetterboxdMovieInput {
  /** Film title to search for on Letterboxd. */
  title: string;

  /**
   * Optional release year to disambiguate titles.
   * When provided, the tool favours search results whose year matches.
   */
  year?: number;
}

/**
 * A single user review extracted from a Letterboxd film page.
 */
export interface LetterboxdReview {
  /** Letterboxd username of the reviewer. */
  user: string;

  /** Star rating string (e.g. "★★★★" or "★★★½"). */
  rating: string;

  /** Truncated review body text. */
  text: string;
}

/**
 * Output payload returned by the `letterboxd_movie` tool.
 */
export interface LetterboxdMovieOutput {
  /** Whether a matching film was found on Letterboxd. */
  found: boolean;

  /** Canonical Letterboxd URL for the film (present when `found` is `true`). */
  url?: string;

  /** Film title as displayed on Letterboxd. */
  title?: string;

  /** Release year string (e.g. "2016"). */
  year?: string;

  /** Aggregate Letterboxd rating string (e.g. "4.1"). */
  rating?: string;

  /** Comma-separated director names. */
  directors?: string;

  /** Comma-separated genre tags. */
  genres?: string;

  /** Short plot synopsis / tagline. */
  synopsis?: string;

  /** Sample of recent user reviews (up to 5). */
  reviews?: LetterboxdReview[];
}

/* -------------------------------------------------------------------------- */
/*  Minimal recipe-tool interface (avoids hard dep on web-scraper package)    */
/* -------------------------------------------------------------------------- */

/**
 * Minimal shape of a recipe-capable tool that can be injected at
 * construction time.  Mirrors the `execute` signature of
 * {@link WebScrapeRecipeTool} without requiring an import dependency.
 */
export interface RecipeToolLike {
  execute(
    args: { recipe: string; params: Record<string, string> },
    context: ToolExecutionContext,
  ): Promise<{ success: boolean; output?: any; error?: string }>;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/** Base URL for Letterboxd film search. */
const SEARCH_URL = 'https://letterboxd.com/search/films';

/** Base URL for individual film pages. */
const FILM_BASE_URL = 'https://letterboxd.com/film';

/** Maximum number of reviews to extract from a film page. */
const MAX_REVIEWS = 5;

/* -------------------------------------------------------------------------- */
/*  User-Agent helper                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Return a realistic desktop Chrome User-Agent string.
 *
 * Rather than pulling in the full {@link UserAgentPool} from the web-scraper
 * extension, this helper generates a single plausible UA on the fly.
 *
 * @returns A User-Agent header value string.
 */
function realisticUserAgent(): string {
  const chromeVersion = 128 + Math.floor(Math.random() * 6); // 128-133
  const platforms = [
    'Windows NT 10.0; Win64; x64',
    'Macintosh; Intel Mac OS X 10_15_7',
    'Macintosh; Intel Mac OS X 14_5',
    'X11; Linux x86_64',
  ];
  const platform = platforms[Math.floor(Math.random() * platforms.length)];
  return (
    `Mozilla/5.0 (${platform}) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`
  );
}

/**
 * Build a minimal set of browser-like request headers.
 *
 * @returns A header record suitable for `fetch()`.
 */
function browserHeaders(): Record<string, string> {
  return {
    'User-Agent': realisticUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };
}

/* -------------------------------------------------------------------------- */
/*  HTML helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Strip HTML tags from a string, collapse whitespace, and trim.
 *
 * @param html - Raw HTML fragment.
 * @returns Plain text content.
 */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/*  LetterboxdMovieTool                                                       */
/* -------------------------------------------------------------------------- */

/**
 * ITool implementation that looks up movie information on Letterboxd.
 *
 * Supports two execution paths:
 * - **Recipe delegation**: when a `web_scrape_recipe` compatible tool is
 *   provided via the constructor, the tool delegates scraping to the
 *   web-scraper extension for more robust, tiered fetching.
 * - **Built-in fallback**: a lightweight `fetch()` + regex scraper that
 *   works without external dependencies or API keys.
 *
 * @example
 * ```ts
 * const tool = new LetterboxdMovieTool();
 * const result = await tool.execute({ title: 'Arrival', year: 2016 }, ctx);
 * if (result.success && result.output?.found) {
 *   console.log(result.output.title, result.output.rating);
 * }
 * ```
 */
export class LetterboxdMovieTool implements ITool<LetterboxdMovieInput, LetterboxdMovieOutput> {
  readonly id = 'letterboxd-movie-v1';
  readonly name = 'letterboxd_movie';
  readonly displayName = 'Letterboxd Movie Lookup';
  readonly description =
    'Look up a movie on Letterboxd by title (and optional year).  Returns ' +
    'the film\'s metadata — title, year, aggregate rating, directors, genres, ' +
    'synopsis, and a sample of recent user reviews.  No API key required.';
  readonly category = 'media';
  readonly version = '1.0.0';
  readonly hasSideEffects = false;

  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Film title to search for on Letterboxd.',
      },
      year: {
        type: 'integer',
        description: 'Optional release year to disambiguate titles with the same name.',
      },
    },
    required: ['title'],
  };

  readonly requiredCapabilities = ['capability:media_search'];

  /**
   * Optional reference to a recipe-capable scraping tool.
   * When provided, the tool delegates to the web-scraper extension's
   * recipe engine rather than using the built-in fallback scraper.
   */
  private readonly recipeTool: RecipeToolLike | undefined;

  /**
   * Create a new LetterboxdMovieTool.
   *
   * @param recipeTool - Optional reference to a `web_scrape_recipe`-compatible
   *                     tool.  When provided, the tool attempts recipe-based
   *                     scraping before falling back to the built-in scraper.
   */
  constructor(recipeTool?: RecipeToolLike) {
    this.recipeTool = recipeTool;
  }

  /**
   * Execute a Letterboxd movie lookup.
   *
   * @param args     - The film title (and optional year) to search for.
   * @param context  - Tool execution context provided by the AgentOS runtime.
   * @returns A {@link ToolExecutionResult} wrapping a {@link LetterboxdMovieOutput}.
   */
  async execute(
    args: LetterboxdMovieInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<LetterboxdMovieOutput>> {
    const title = (args.title || '').trim();
    if (!title) {
      return { success: false, error: '`title` must be a non-empty string.' };
    }

    // Strategy 1: delegate to web_scrape_recipe if available
    if (this.recipeTool) {
      try {
        const recipeResult = await this.executeViaRecipe(title, args.year, context);
        if (recipeResult) {
          return recipeResult;
        }
        // Recipe returned null — fall through to built-in scraper
      } catch {
        // Recipe failed — fall through to built-in scraper
      }
    }

    // Strategy 2: built-in fetch + regex scraper
    try {
      return await this.executeViaFallback(title, args.year);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Letterboxd lookup failed: ${msg}` };
    }
  }

  /**
   * Custom argument validation.
   *
   * @param args - Raw arguments from the LLM.
   * @returns Validation result with error details if invalid.
   */
  validateArgs(args: Record<string, unknown>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!args.title || typeof args.title !== 'string') {
      errors.push('`title` must be a non-empty string.');
    }

    if (args.year !== undefined && (typeof args.year !== 'number' || !Number.isInteger(args.year))) {
      errors.push('`year` must be an integer when provided.');
    }

    return { isValid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  /* -------------------------------------------------------------------------- */
  /*  Strategy 1: Recipe delegation                                             */
  /* -------------------------------------------------------------------------- */

  /**
   * Attempt to look up the film via the web-scraper recipe engine.
   *
   * Passes the title (and year if provided) to a `letterboxd-movie` recipe.
   * Returns `null` if the recipe is not available or returns no useful data,
   * signalling the caller to fall back to the built-in scraper.
   *
   * @param title   - Film title to search for.
   * @param year    - Optional release year.
   * @param context - Tool execution context for the delegated call.
   * @returns A {@link ToolExecutionResult} if the recipe succeeded, or `null`
   *          to signal fallback.
   */
  private async executeViaRecipe(
    title: string,
    year: number | undefined,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<LetterboxdMovieOutput> | null> {
    if (!this.recipeTool) return null;

    const params: Record<string, string> = { query: title };
    if (year !== undefined) {
      params.year = String(year);
    }

    const result = await this.recipeTool.execute(
      { recipe: 'letterboxd-movie', params },
      context,
    );

    if (!result.success || !result.output?.data) {
      return null;
    }

    const data = result.output.data as Record<string, any>;

    // The recipe is expected to return structured data with known keys
    const output: LetterboxdMovieOutput = {
      found: true,
      url: data.url as string | undefined,
      title: data.title as string | undefined,
      year: data.year as string | undefined,
      rating: data.rating as string | undefined,
      directors: data.directors as string | undefined,
      genres: data.genres as string | undefined,
      synopsis: data.synopsis as string | undefined,
      reviews: Array.isArray(data.reviews) ? data.reviews : undefined,
    };

    return { success: true, output };
  }

  /* -------------------------------------------------------------------------- */
  /*  Strategy 2: Built-in fallback scraper                                     */
  /* -------------------------------------------------------------------------- */

  /**
   * Look up the film using the built-in `fetch()` + regex scraper.
   *
   * Performs up to three HTTP requests:
   * 1. **Search** — `GET /search/films/{encodedTitle}/` to find the film slug.
   * 2. **Direct URL** — if search fails (e.g. Cloudflare 403), tries
   *    `GET /film/{slug}/` where the slug is derived from the title.
   *    Film detail pages are typically not behind Cloudflare challenges.
   * 3. **Film page** — `GET /film/{slug}/` to extract metadata and reviews.
   *
   * @param title - Film title to search for.
   * @param year  - Optional release year for disambiguation.
   * @returns A {@link ToolExecutionResult} wrapping the extracted film data.
   */
  private async executeViaFallback(
    title: string,
    year?: number,
  ): Promise<ToolExecutionResult<LetterboxdMovieOutput>> {
    // Step 1: Search for the film slug
    let slug = await this.searchFilmSlug(title, year);

    // Step 2: If search failed (e.g. Cloudflare 403), try the direct film
    // URL pattern — detail pages are typically not behind Cloudflare.
    if (!slug) {
      const directSlug = this.titleToSlug(title);
      const directUrl = `${FILM_BASE_URL}/${directSlug}/`;
      const directHtml = await this.fetchPage(directUrl);
      if (directHtml) {
        const output = this.parseFilmPage(directHtml, directUrl);
        return { success: true, output };
      }

      return {
        success: true,
        output: { found: false },
        error: 'Search blocked by Cloudflare — tried direct URL lookup',
      };
    }

    // Step 3: Fetch and parse the film page
    const filmUrl = `${FILM_BASE_URL}/${slug}/`;
    const filmHtml = await this.fetchPage(filmUrl);
    if (!filmHtml) {
      return {
        success: true,
        output: { found: false },
      };
    }

    const output = this.parseFilmPage(filmHtml, filmUrl);
    return { success: true, output };
  }

  /**
   * Derive a URL slug from a film title.
   *
   * Lowercases the title, replaces non-alphanumeric runs with hyphens,
   * and strips leading/trailing hyphens.
   *
   * @example
   * ```
   * titleToSlug('The Dark Knight') // => 'the-dark-knight'
   * titleToSlug('Parasite')        // => 'parasite'
   * ```
   *
   * @param title - Film title to slugify.
   * @returns A URL-safe slug string.
   */
  private titleToSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Search Letterboxd for a film and return the slug of the best match.
   *
   * Parses the search results HTML for film links, optionally filtering
   * by year when provided.
   *
   * @param title - Film title query string.
   * @param year  - Optional year to prefer in search results.
   * @returns The film slug (e.g. "arrival-2016") or `null` if not found.
   */
  private async searchFilmSlug(title: string, year?: number): Promise<string | null> {
    const encoded = encodeURIComponent(title);
    const searchUrl = `${SEARCH_URL}/${encoded}/`;
    const html = await this.fetchPage(searchUrl);
    if (!html) return null;

    // Letterboxd search results contain links like /film/{slug}/
    // within list items that also contain the year in a small tag
    const resultPattern = /<a\s+[^>]*href="\/film\/([^/"]+)\/"[^>]*>/gi;
    const slugs: Array<{ slug: string; index: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = resultPattern.exec(html)) !== null) {
      slugs.push({ slug: match[1]!, index: match.index });
    }

    if (slugs.length === 0) return null;

    // If a year is provided, try to find a result whose surrounding
    // HTML context mentions that year
    if (year !== undefined) {
      for (const { slug, index } of slugs) {
        const contextWindow = html.slice(index, index + 500);
        if (contextWindow.includes(String(year))) {
          return slug;
        }
      }
    }

    // Default to first result
    return slugs[0]!.slug;
  }

  /**
   * Fetch a page from Letterboxd with realistic browser headers.
   *
   * Follows redirects and returns the response body as a string.
   * Returns `null` on non-2xx status codes or network errors.
   *
   * @param url - Fully qualified URL to fetch.
   * @returns HTML body string or `null` on failure.
   */
  private async fetchPage(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: browserHeaders(),
        redirect: 'follow',
      });

      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  /**
   * Parse a Letterboxd film page HTML and extract structured metadata.
   *
   * Uses regex patterns to extract:
   * - Title and year from the headline / head section
   * - Aggregate rating from the rating histogram section
   * - Director names from the crew section
   * - Genre tags from the genre tab
   * - Synopsis from the truncated description
   * - A sample of recent user reviews
   *
   * @param html    - Raw HTML of the film page.
   * @param filmUrl - Canonical URL for inclusion in the output.
   * @returns A {@link LetterboxdMovieOutput} with extracted data.
   */
  private parseFilmPage(html: string, filmUrl: string): LetterboxdMovieOutput {
    const output: LetterboxdMovieOutput = {
      found: true,
      url: filmUrl,
    };

    // --- Title ---
    // <meta property="og:title" content="Film Title (Year)">
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (ogTitleMatch) {
      const ogTitle = ogTitleMatch[1]!;
      // Split "Film Title (2016)" or just use raw
      const titleYearMatch = ogTitle.match(/^(.+?)\s*\((\d{4})\)\s*$/);
      if (titleYearMatch) {
        output.title = stripTags(titleYearMatch[1]!);
        output.year = titleYearMatch[2];
      } else {
        output.title = stripTags(ogTitle);
      }
    }

    // Fallback: <h1 class="headline-1 ...">Title</h1>
    if (!output.title) {
      const h1Match = html.match(/<h1[^>]*class="[^"]*headline[^"]*"[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) {
        output.title = stripTags(h1Match[1]!);
      }
    }

    // --- Year (fallback) ---
    // <small class="number"><a href="/films/year/2016/">2016</a></small>
    if (!output.year) {
      const yearMatch = html.match(/<a\s+href="\/films\/year\/(\d{4})\/"[^>]*>\d{4}<\/a>/i);
      if (yearMatch) {
        output.year = yearMatch[1];
      }
    }

    // --- Aggregate rating ---
    // <meta name="twitter:data2" content="X.XX out of 5">
    const ratingMeta = html.match(/<meta\s+name="twitter:data2"\s+content="([\d.]+)\s+out\s+of\s+5"/i);
    if (ratingMeta) {
      output.rating = ratingMeta[1];
    }

    // Fallback: weighted average from histogram or schema.org
    if (!output.rating) {
      // <span class="average-rating">X.X</span>
      const avgMatch = html.match(/<span[^>]*class="[^"]*average-rating[^"]*"[^>]*>([\d.]+)<\/span>/i);
      if (avgMatch) {
        output.rating = avgMatch[1];
      }
    }

    // --- Directors ---
    // <meta name="twitter:data1" content="Director Name, Director Name">
    const directorMeta = html.match(/<meta\s+name="twitter:data1"\s+content="([^"]+)"/i);
    if (directorMeta) {
      output.directors = directorMeta[1];
    }

    // Fallback: <a href="/director/.../">Name</a> within crew block
    if (!output.directors) {
      const directorLinks: string[] = [];
      const dirPattern = /<a\s+href="\/director\/[^/"]+\/"[^>]*>([^<]+)<\/a>/gi;
      let dirMatch: RegExpExecArray | null;
      while ((dirMatch = dirPattern.exec(html)) !== null) {
        const name = stripTags(dirMatch[1]!);
        if (name && !directorLinks.includes(name)) {
          directorLinks.push(name);
        }
      }
      if (directorLinks.length > 0) {
        output.directors = directorLinks.join(', ');
      }
    }

    // --- Genres ---
    // <a class="text-slug" href="/films/genre/drama/">Drama</a>
    const genreSet: string[] = [];
    const genrePattern = /<a[^>]+href="\/films\/genre\/[^/"]+\/"[^>]*>([^<]+)<\/a>/gi;
    let genreMatch: RegExpExecArray | null;
    while ((genreMatch = genrePattern.exec(html)) !== null) {
      const genre = stripTags(genreMatch[1]!);
      if (genre && !genreSet.includes(genre)) {
        genreSet.push(genre);
      }
    }
    if (genreSet.length > 0) {
      output.genres = genreSet.join(', ');
    }

    // --- Synopsis ---
    // <meta property="og:description" content="...">
    const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
    if (ogDescMatch) {
      output.synopsis = stripTags(ogDescMatch[1]!);
    }

    // Fallback: <div class="truncate">...<p>...</p>...</div>
    if (!output.synopsis) {
      const truncateMatch = html.match(/<div[^>]*class="[^"]*truncate[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (truncateMatch) {
        // Extract first <p> inside the truncate div
        const pMatch = truncateMatch[1]!.match(/<p>([^<]+)<\/p>/i);
        if (pMatch) {
          output.synopsis = stripTags(pMatch[1]!);
        }
      }
    }

    // --- Reviews ---
    output.reviews = this.parseReviews(html);

    return output;
  }

  /**
   * Extract a sample of user reviews from a Letterboxd film page.
   *
   * Looks for review blocks in the "popular reviews" or "recent reviews"
   * section and extracts username, star rating, and review text.
   *
   * @param html - Raw HTML of the film page.
   * @returns An array of up to {@link MAX_REVIEWS} parsed reviews.
   */
  private parseReviews(html: string): LetterboxdReview[] {
    const reviews: LetterboxdReview[] = [];

    // Reviews are in <li> blocks within a section that contains
    // class="film-detail-content" or similar review containers.
    // Each review typically has:
    //   - <a class="context" href="/USERNAME/...">USERNAME</a>
    //   - <span class="rating ...">★★★★</span>
    //   - <div class="body-text ..."><p>Review text</p></div>

    // Find review blocks — they contain "attribution" or "film-detail" class
    const reviewBlockPattern =
      /<li[^>]*class="[^"]*film-detail[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;

    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = reviewBlockPattern.exec(html)) !== null && reviews.length < MAX_REVIEWS) {
      const block = blockMatch[1]!;

      // Username
      const userMatch = block.match(
        /<a[^>]*class="[^"]*context[^"]*"[^>]*href="\/([^/"]+)\/[^"]*"[^>]*>/i,
      );
      // Also try: <strong class="name">username</strong>
      const userFallback = block.match(/<strong[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/strong>/i);
      const user = userMatch
        ? userMatch[1]!
        : userFallback
          ? stripTags(userFallback[1]!)
          : 'anonymous';

      // Star rating — Letterboxd uses ★ and ½ characters
      const ratingMatch = block.match(/<span[^>]*class="[^"]*rating[^"]*"[^>]*>([★½]+)<\/span>/i);
      const rating = ratingMatch ? ratingMatch[1]! : '';

      // Review text
      const bodyMatch = block.match(
        /<div[^>]*class="[^"]*body-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      );
      const text = bodyMatch ? stripTags(bodyMatch[1]!).slice(0, 500) : '';

      if (user !== 'anonymous' || text) {
        reviews.push({ user, rating, text });
      }
    }

    return reviews;
  }
}
