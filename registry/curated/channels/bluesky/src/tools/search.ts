// @ts-nocheck
/**
 * @fileoverview BlueskySearchTool — search posts or people on Bluesky.
 *
 * Supports two search modes:
 * - "posts" (default): Full-text search across Bluesky posts.
 * - "people": Search for user profiles by name or handle.
 */

import type { BlueskyService } from '../BlueskyService.js';

export class BlueskySearchTool {
  readonly id = 'blueskySearch';
  readonly name = 'blueskySearch';
  readonly displayName = 'Search Bluesky';
  readonly description = 'Search Bluesky for posts or people matching a query.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      type: { type: 'string', enum: ['posts', 'people'], description: 'Search type (default: "posts")' },
      limit: { type: 'number', description: 'Max results to return (default 25, max 100)' },
    },
    required: ['query'],
  };

  constructor(private service: BlueskyService) {}

  async execute(args: { query: string; type?: 'posts' | 'people'; limit?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const searchType = args.type ?? 'posts';

      if (searchType === 'people') {
        const actors = await this.service.searchActors(args.query, args.limit);
        return { success: true, data: actors };
      } else {
        const posts = await this.service.searchPosts(args.query, args.limit);
        return { success: true, data: posts };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
