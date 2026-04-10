// @ts-nocheck
/**
 * OMDB Details Tool — ITool implementation for fetching full movie/show
 * details from the Open Movie Database API.
 *
 * Returns comprehensive metadata including plot, cast, crew, ratings from
 * IMDB, Rotten Tomatoes, and Metacritic, box office earnings, and more.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult, JSONSchemaObject } from '@framers/agentos';

import { OMDBService } from '../OMDBService.js';
import type { OMDBDetailsResponse } from '../OMDBService.js';

/** Input parameters for the OMDB details tool. */
export interface OMDBDetailsInput {
  /** IMDB identifier (e.g. "tt1375666"). Takes precedence over title when both are provided. */
  imdbId?: string;
  /** Title to look up. Used when imdbId is not provided. */
  title?: string;
  /** Optional year to disambiguate titles. */
  year?: number;
  /** Length of the plot summary to include. */
  plot?: 'short' | 'full';
}

/** Output returned by the OMDB details tool (full movie/show data). */
export type OMDBDetailsOutput = OMDBDetailsResponse;

/**
 * Fetches comprehensive details for a single movie, TV show, or episode
 * from the Open Movie Database.
 *
 * Supports lookup by IMDB ID (preferred) or by title string. Returns
 * ratings from multiple aggregators (IMDB, Rotten Tomatoes, Metacritic),
 * cast and crew information, box office data, and more.
 *
 * Implements the AgentOS {@link ITool} interface for extension pack
 * registration and capability discovery.
 */
export class OMDBDetailsTool implements ITool<OMDBDetailsInput, OMDBDetailsOutput> {
  /** Stable version identifier for this tool implementation. */
  readonly id = 'omdb-details-v1';
  /** Canonical tool name used for invocation by agents. */
  readonly name = 'omdb_details';
  /** Human-readable display name. */
  readonly displayName = 'OMDB Details';
  /** Description surfaced to agents during capability discovery. */
  readonly description =
    'Get full details for a movie, TV show, or episode from OMDB. ' +
    'Returns comprehensive metadata including ratings from IMDB, Rotten Tomatoes, and Metacritic, ' +
    'cast, crew, plot, box office, and more. Lookup by IMDB ID or title.';
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
      imdbId: {
        type: 'string',
        description: 'IMDB identifier (e.g. "tt1375666"). Takes precedence over title.',
      },
      title: {
        type: 'string',
        description: 'Title to look up. Used when imdbId is not provided.',
      },
      year: {
        type: 'integer',
        description: 'Optional release year to disambiguate titles.',
      },
      plot: {
        type: 'string',
        enum: ['short', 'full'],
        default: 'short',
        description: 'Length of the plot summary.',
      },
    },
  };

  /** Capability tags for the discovery engine. */
  readonly requiredCapabilities = ['capability:media_search'];

  /** The underlying OMDB API service. */
  private service: OMDBService;

  /**
   * Creates a new OMDBDetailsTool instance.
   *
   * @param service - Pre-configured OMDBService instance for API communication
   */
  constructor(service: OMDBService) {
    this.service = service;
  }

  /**
   * Execute a detail lookup against the OMDB API.
   *
   * @param args     - Lookup parameters (at least one of imdbId or title required)
   * @param _context - Tool execution context (unused for this read-only tool)
   * @returns A result object containing full movie/show data or an error message
   */
  async execute(
    args: OMDBDetailsInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<OMDBDetailsOutput>> {
    if (!args.imdbId && !args.title) {
      return { success: false, error: 'Either imdbId or title must be provided.' };
    }

    try {
      const response = await this.service.details({
        imdbId: args.imdbId,
        title: args.title,
        year: args.year,
        plot: args.plot,
      });

      return {
        success: true,
        output: response,
      };
    } catch (err: any) {
      return { success: false, error: `OMDB details lookup failed: ${err.message}` };
    }
  }
}
