/**
 * @fileoverview Unit tests for CrossPlatformAnalyticsTool.
 *
 * Tests cover: tool metadata, multi-platform metric aggregation,
 * field name normalization (likes/favouritesCount, shares/retweets/reblogsCount),
 * engagement rate calculation, missing post IDs, executor errors,
 * and missing executor handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CrossPlatformAnalyticsTool,
  type ToolExecutorFn,
  type CrossPlatformAnalyticsInput,
} from '../src/CrossPlatformAnalyticsTool.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createMockExecutor(
  platformData: Record<string, Record<string, unknown>>,
): ToolExecutorFn {
  return vi.fn(async (toolName: string, _args: Record<string, unknown>) => {
    // Extract platform name from tool name (e.g. "twitterAnalytics" -> "twitter")
    const platform = toolName.replace('Analytics', '');
    if (platformData[platform]) {
      return { success: true, data: platformData[platform] };
    }
    return { success: false, error: `No data configured for ${toolName}` };
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('CrossPlatformAnalyticsTool', () => {
  let tool: CrossPlatformAnalyticsTool;

  beforeEach(() => {
    tool = new CrossPlatformAnalyticsTool();
  });

  /* ── Metadata ─────────────────────────────────────────────────── */

  describe('metadata', () => {
    it('should expose the correct id and name', () => {
      expect(tool.id).toBe('crossPlatformAnalytics');
      expect(tool.name).toBe('crossPlatformAnalytics');
    });

    it('should declare hasSideEffects as false', () => {
      expect(tool.hasSideEffects).toBe(false);
    });

    it('should require platforms in the input schema', () => {
      expect(tool.inputSchema.required).toEqual(['platforms']);
    });

    it('should define timeRange as an enum with 4 options', () => {
      const timeRange = tool.inputSchema.properties.timeRange as { enum: string[] };
      expect(timeRange.enum).toEqual(['24h', '7d', '30d', '90d']);
    });
  });

  /* ── Aggregation across platforms ─────────────────────────────── */

  describe('metric aggregation', () => {
    it('should aggregate likes, comments, shares, and impressions from multiple platforms', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 100, comments: 20, shares: 50, impressions: 5000 },
        linkedin: { likes: 200, comments: 30, shares: 80, impressions: 10000 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter', 'linkedin'],
        postIds: { twitter: 'tw-1', linkedin: 'li-1' },
      });

      expect(result.success).toBe(true);
      const totals = result.data!.totals;
      expect(totals.likes).toBe(300);
      expect(totals.comments).toBe(50);
      expect(totals.shares).toBe(130);
      expect(totals.impressions).toBe(15000);
    });

    it('should pass timeRange to the per-platform executor', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 10, comments: 2, shares: 5, impressions: 500 },
      });
      tool.setToolExecutor(executor);

      await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
        timeRange: '30d',
      });

      expect(executor).toHaveBeenCalledWith('twitterAnalytics', {
        postId: 'tw-1',
        timeRange: '30d',
      });
    });

    it('should default timeRange to 7d', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 10, comments: 2, shares: 5, impressions: 500 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      expect(executor).toHaveBeenCalledWith('twitterAnalytics', {
        postId: 'tw-1',
        timeRange: '7d',
      });

      expect(result.data!.timeRange).toBe('7d');
    });

    it('should return the timeRange in the output', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 0, comments: 0, shares: 0, impressions: 0 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
        timeRange: '90d',
      });

      expect(result.data!.timeRange).toBe('90d');
    });
  });

  /* ── Field name normalization ─────────────────────────────────── */

  describe('field name normalization', () => {
    it('should normalize favouritesCount to likes', async () => {
      const executor = createMockExecutor({
        mastodon: { favouritesCount: 42, repliesCount: 5, reblogsCount: 12, impressions: 800 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['mastodon'],
        postIds: { mastodon: 'masto-1' },
      });

      expect(result.data!.totals.likes).toBe(42);
      expect(result.data!.totals.comments).toBe(5);
      expect(result.data!.totals.shares).toBe(12);
    });

    it('should normalize retweets to shares (Twitter)', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 100, comments: 10, retweets: 30, impressions: 2000 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-2' },
      });

      expect(result.data!.totals.shares).toBe(30);
    });

    it('should normalize reposts to shares (Bluesky)', async () => {
      const executor = createMockExecutor({
        bluesky: { likes: 50, comments: 3, reposts: 15, views: 1500 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['bluesky'],
        postIds: { bluesky: 'bsky-1' },
      });

      expect(result.data!.totals.shares).toBe(15);
    });

    it('should normalize views to impressions', async () => {
      const executor = createMockExecutor({
        bluesky: { likes: 50, comments: 3, reposts: 15, views: 1500 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['bluesky'],
        postIds: { bluesky: 'bsky-1' },
      });

      expect(result.data!.totals.impressions).toBe(1500);
    });

    it('should handle mixed normalized and standard field names across platforms', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 100, comments: 10, retweets: 30, impressions: 2000 },
        mastodon: { favouritesCount: 50, repliesCount: 5, reblogsCount: 20, impressions: 1000 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter', 'mastodon'],
        postIds: { twitter: 'tw-1', mastodon: 'masto-1' },
      });

      expect(result.data!.totals.likes).toBe(150);
      expect(result.data!.totals.comments).toBe(15);
      expect(result.data!.totals.shares).toBe(50);
      expect(result.data!.totals.impressions).toBe(3000);
    });
  });

  /* ── Engagement rate calculation ──────────────────────────────── */

  describe('engagement rate', () => {
    it('should calculate engagement rate as (likes+comments+shares)/impressions * 100', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 100, comments: 20, shares: 30, impressions: 5000 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      // (100 + 20 + 30) / 5000 * 100 = 3.00
      expect(result.data!.totals.engagement).toBe(3);
    });

    it('should return 0 engagement when impressions are 0', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 5, comments: 1, shares: 0, impressions: 0 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      expect(result.data!.totals.engagement).toBe(0);
    });

    it('should calculate engagement across all platforms combined', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 50, comments: 10, shares: 20, impressions: 2000 },
        linkedin: { likes: 50, comments: 10, shares: 20, impressions: 3000 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter', 'linkedin'],
        postIds: { twitter: 'tw-1', linkedin: 'li-1' },
      });

      // (100 + 20 + 40) / 5000 * 100 = 3.20
      expect(result.data!.totals.engagement).toBe(3.2);
    });

    it('should round engagement to 2 decimal places', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 1, comments: 1, shares: 1, impressions: 7 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      // (3 / 7) * 100 = 42.857... -> 42.86
      expect(result.data!.totals.engagement).toBe(42.86);
    });
  });

  /* ── Missing post IDs ─────────────────────────────────────────── */

  describe('missing post IDs', () => {
    it('should report error for a platform without a post ID', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 100, comments: 20, shares: 30, impressions: 5000 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter', 'linkedin'],
        postIds: { twitter: 'tw-1' }, // linkedin has no postId
      });

      expect(result.success).toBe(true);
      const linkedinResult = result.data!.platforms['linkedin'] as { error: string };
      expect(linkedinResult.error).toBe('No post ID provided for this platform');
    });

    it('should still aggregate metrics from platforms that have post IDs', async () => {
      const executor = createMockExecutor({
        twitter: { likes: 100, comments: 20, shares: 30, impressions: 5000 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter', 'linkedin'],
        postIds: { twitter: 'tw-1' },
      });

      expect(result.data!.totals.likes).toBe(100);
    });
  });

  /* ── Executor errors ──────────────────────────────────────────── */

  describe('executor errors', () => {
    it('should handle executor returning success=false', async () => {
      const executor = vi.fn(async () => ({
        success: false,
        error: 'API rate limited',
      }));
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      expect(result.success).toBe(true); // tool-level always succeeds
      const twitterResult = result.data!.platforms['twitter'] as { error: string };
      expect(twitterResult.error).toBe('API rate limited');
    });

    it('should handle executor returning success=false with no error message', async () => {
      const executor = vi.fn(async () => ({
        success: false,
      }));
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      const twitterResult = result.data!.platforms['twitter'] as { error: string };
      expect(twitterResult.error).toBe('No data returned');
    });

    it('should handle thrown errors from executor gracefully', async () => {
      const executor = vi.fn(async () => {
        throw new Error('Connection refused');
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      expect(result.success).toBe(true);
      const twitterResult = result.data!.platforms['twitter'] as { error: string };
      expect(twitterResult.error).toBe('Connection refused');
    });

    it('should handle non-Error thrown values', async () => {
      const executor = vi.fn(async () => {
        throw 42; // eslint-disable-line no-throw-literal
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      const twitterResult = result.data!.platforms['twitter'] as { error: string };
      expect(twitterResult.error).toBe('42');
    });
  });

  /* ── No executor ──────────────────────────────────────────────── */

  describe('missing tool executor', () => {
    it('should report error when executor is not set and postId is present', async () => {
      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      const twitterResult = result.data!.platforms['twitter'] as { error: string };
      expect(twitterResult.error).toBe('No tool executor available');
    });
  });

  /* ── toNumber helper (via output) ─────────────────────────────── */

  describe('toNumber coercion', () => {
    it('should coerce string numbers in platform metrics', async () => {
      const executor = createMockExecutor({
        twitter: { likes: '50', comments: '10', shares: '20', impressions: '2000' },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      expect(result.data!.totals.likes).toBe(50);
      expect(result.data!.totals.comments).toBe(10);
      expect(result.data!.totals.shares).toBe(20);
      expect(result.data!.totals.impressions).toBe(2000);
    });

    it('should treat undefined/null metrics as 0', async () => {
      const executor = createMockExecutor({
        twitter: { likes: undefined, comments: null, impressions: 1000 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      expect(result.data!.totals.likes).toBe(0);
      expect(result.data!.totals.comments).toBe(0);
      expect(result.data!.totals.shares).toBe(0);
    });

    it('should treat NaN as 0', async () => {
      const executor = createMockExecutor({
        twitter: { likes: NaN, comments: 'not-a-number', shares: 5, impressions: 100 },
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        platforms: ['twitter'],
        postIds: { twitter: 'tw-1' },
      });

      expect(result.data!.totals.likes).toBe(0);
      expect(result.data!.totals.comments).toBe(0);
      expect(result.data!.totals.shares).toBe(5);
    });
  });
});
