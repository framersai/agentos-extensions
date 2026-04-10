// @ts-nocheck
/**
 * OMDB Search Tool — ITool implementation for searching movies, TV shows,
 * and episodes via the Open Movie Database API.
 *
 * Returns paginated search results with basic metadata (title, year, IMDB ID,
 * type, and poster URL).
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult, JSONSchemaObject } from '@framers/agentos';

import { OMDBService } from '../OMDBService.js';
import type { OMDBSearchResult } from '../OMDBService.js';

/** Input parameters for the OMDB search tool. */
export interface OMDBSearchInput {
  /** Title search string. */
  query: string;
  /** Optional year to filter results. */
  year?: number;
  /** Optional media type filter. */
  type?: 'movie' | 'series' | 'episode';
  /** Page number for paginated results (1-based, 10 results per page). */
  page?: number;
}

/** Output returned by the OMDB search tool. */
export interface OMDBSearchOutput {
  /** Array of matching titles with basic metadata. */
  results: OMDBSearchResult[];
  /** Total number of results available across all pages. */
  totalResults: number;
}

/**
 * Searches the Open Movie Database for movies, TV shows, and episodes
 * matching a title query.
 *
 * Implements the AgentOS {@link ITool} interface so it can be registered
 * in any extension pack and discovered by the capability system.
 */
export class OMDBSearchTool implements ITool<OMDBSearchInput, OMDBSearchOutput> {
  /** Stable version identifier for this tool implementation. */
  readonly id = 'omdb-search-v1';
  /** Canonical tool name used for invocation by agents. */
  readonly name = 'omdb_search';
  /** Human-readable display name. */
  readonly displayName = 'OMDB Search';
  /** Description surfaced to agents during capability discovery. */
  readonly description =
    'Search for movies, TV shows, and episodes by title via the OMDB API. ' +
    'Returns basic metadata including IMDB IDs that can be used with omdb_details for full information.';
  /** Tool category for capability indexing. */
  readonly category = 'media';
  /** Semantic version of this tool. */
  readonly version = '1.0.0';
  /** Whether this tool causes side effects (it does not — read-only lookups). */
  readonly hasSideEffects = false;

  /** JSON Schema describing the expected input parameters. */
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Title search string for movies, TV shows, or episodes.' },
      year: { type: 'integer', description: 'Optional release year to narrow results.' },
      type: {
        type: 'string',
        enum: ['movie', 'series', 'episode'],
        description: 'Optional media type filter.',
      },
      page: {
        type: 'integer',
        minimum: 1,
        default: 1,
        description: 'Page number for paginated results (10 results per page).',
      },
    },
    required: ['query'],
  };

  /** Capability tags for the discovery engine. */
  readonly requiredCapabilities = ['capability:media_search'];

  /** The underlying OMDB API service. */
  private service: OMDBService;

  /**
   * Creates a new OMDBSearchTool instance.
   *
   * @param service - Pre-configured OMDBService instance for API communication
   */
  constructor(service: OMDBService) {
    this.service = service;
  }

  /**
   * Execute a search against the OMDB API.
   *
   * @param args     - Search parameters (query required, year/type/page optional)
   * @param _context - Tool execution context (unused for this read-only tool)
   * @returns A result object containing matching titles or an error message
   */
  async execute(
    args: OMDBSearchInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<OMDBSearchOutput>> {
    try {
      const response = await this.service.search(args.query, {
        year: args.year,
        type: args.type,
        page: args.page,
      });

      return {
        success: true,
        output: {
          results: response.results,
          totalResults: response.totalResults,
        },
      };
    } catch (err: any) {
      return { success: false, error: `OMDB search failed: ${err.message}` };
    }
  }
}
