// @ts-nocheck
/**
 * Hacker News Tool — fetch and search HN stories via Algolia API.
 *
 * General-purpose extension tool: fetches raw stories and returns them as-is.
 * No category inference — consumers (wunderland, wunderland-sol, or any agent)
 * decide how to classify content on their end.
 *
 * No API key required — uses the public Algolia HN Search API.
 */

import { createHash } from 'crypto';
import type { ITool, ToolExecutionContext, ToolExecutionResult, JSONSchemaObject } from '@framers/agentos';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HackerNewsInput {
  /** Search query (empty = front page stories). */
  query?: string;
  /** Sort order. */
  sortBy?: 'relevance' | 'date' | 'points';
  /** Minimum point threshold. */
  minPoints?: number;
  /** Time range filter. */
  timeRange?: 'day' | 'week' | 'month' | 'year';
  /** HN tag filter (story, comment, show_hn, ask_hn, front_page). */
  tag?: 'story' | 'comment' | 'show_hn' | 'ask_hn' | 'front_page';
  /** Maximum results to return. */
  maxResults?: number;
}

export interface HackerNewsStory {
  /** Story title. */
  title: string;
  /** External URL (or HN discussion if no external link). */
  url: string;
  /** Upvote count. */
  points: number;
  /** Author username. */
  author: string;
  /** Number of comments. */
  commentCount: number;
  /** HN discussion URL. */
  hnUrl: string;
  /** ISO timestamp. */
  publishedAt: string;
  /** SHA-256 hash of title::url for deduplication. */
  contentHash: string;
  /** Algolia object ID. */
  objectID: string;
}

export interface HackerNewsOutput {
  /** The query that was searched, or 'front_page' if none. */
  query: string;
  /** Returned stories. */
  stories: HackerNewsStory[];
  /** Number of stories returned. */
  totalFound: number;
}

// ---------------------------------------------------------------------------
// Tool implementation
// ---------------------------------------------------------------------------

export class HackerNewsTool implements ITool<HackerNewsInput, HackerNewsOutput> {
  readonly id = 'hacker-news-v1';
  readonly name = 'hacker_news';
  readonly displayName = 'Hacker News';
  readonly description =
    'Fetch and search Hacker News stories. Supports filtering by search query, ' +
    'time range, minimum points, HN tags (show_hn, ask_hn, etc.), and sort order. ' +
    'Returns raw story data — no opinionated categorization. No API key required.';
  readonly category = 'research';
  readonly version = '1.0.0';
  readonly hasSideEffects = false;

  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query. Leave empty for front page stories.' },
      sortBy: { type: 'string', enum: ['relevance', 'date', 'points'], default: 'points' },
      minPoints: { type: 'integer', minimum: 0, default: 0, description: 'Minimum upvote threshold.' },
      timeRange: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Restrict results to a time window.' },
      tag: { type: 'string', enum: ['story', 'comment', 'show_hn', 'ask_hn', 'front_page'], default: 'story', description: 'HN content type filter.' },
      maxResults: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
    },
    required: [],
  };

  readonly requiredCapabilities = ['capability:web_search'];

  async execute(args: HackerNewsInput, _context: ToolExecutionContext): Promise<ToolExecutionResult<HackerNewsOutput>> {
    try {
      const maxResults = args.maxResults ?? 10;
      const query = args.query?.trim() ?? '';
      const tag = args.tag ?? (query ? 'story' : 'front_page');

      // Build Algolia API URL
      const params = new URLSearchParams({
        tags: tag,
        hitsPerPage: String(Math.min(maxResults * 2, 100)),
      });

      if (query) {
        params.set('query', query);
      }

      if (args.timeRange) {
        const now = Math.floor(Date.now() / 1000);
        const ranges: Record<string, number> = { day: 86400, week: 604800, month: 2592000, year: 31536000 };
        params.set('numericFilters', `created_at_i>${now - (ranges[args.timeRange] ?? 604800)}`);
      }

      if (args.minPoints && args.minPoints > 0) {
        const existing = params.get('numericFilters');
        const pointsFilter = `points>${args.minPoints}`;
        params.set('numericFilters', existing ? `${existing},${pointsFilter}` : pointsFilter);
      }

      const url = `https://hn.algolia.com/api/v1/search?${params}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let data: any;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return { success: false, error: `HN API returned ${res.status}` };
        data = await res.json();
      } finally {
        clearTimeout(timeout);
      }

      if (!data.hits?.length) {
        return { success: true, output: { query: query || 'front_page', stories: [], totalFound: 0 } };
      }

      // Map raw Algolia hits to clean story objects
      let stories: HackerNewsStory[] = data.hits
        .filter((h: any) => h.title)
        .map((hit: any) => {
          const storyUrl = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
          return {
            title: hit.title,
            url: storyUrl,
            points: hit.points ?? 0,
            author: hit.author ?? 'unknown',
            commentCount: hit.num_comments ?? 0,
            hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
            publishedAt: hit.created_at ?? new Date().toISOString(),
            contentHash: createHash('sha256').update(`${hit.title}::${storyUrl}`).digest('hex'),
            objectID: hit.objectID,
          };
        });

      // Sort
      if (args.sortBy === 'date') {
        stories.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      } else if (args.sortBy === 'points' || !args.sortBy) {
        stories.sort((a, b) => b.points - a.points);
      }
      // 'relevance' — keep Algolia's ordering

      stories = stories.slice(0, maxResults);

      return {
        success: true,
        output: { query: query || 'front_page', stories, totalFound: stories.length },
      };
    } catch (err: any) {
      return { success: false, error: `Hacker News fetch failed: ${err.message}` };
    }
  }
}
