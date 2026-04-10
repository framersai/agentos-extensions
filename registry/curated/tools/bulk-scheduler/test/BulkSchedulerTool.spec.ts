// @ts-nocheck
/**
 * @fileoverview Unit tests for BulkSchedulerTool.
 *
 * Tests cover: tool metadata, batch scheduling, template variable expansion
 * ({{date}}, {{time}}, {{day}}, {{month}}, {{year}}, {{iso}}, {{platform}}),
 * validation (empty posts, invalid dates, empty content, unsupported platforms,
 * missing platforms), executor delegation, partial failures, and standalone mode.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BulkSchedulerTool,
  type ToolExecutorFn,
  type BulkScheduleInput,
  type ScheduledPost,
} from '../src/BulkSchedulerTool.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function futureISO(hoursFromNow = 1): string {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return d.toISOString();
}

function createMockExecutor(
  override?: (toolName: string, args: Record<string, unknown>) => { success: boolean; error?: string },
): ToolExecutorFn {
  return vi.fn(async (toolName: string, args: Record<string, unknown>) => {
    if (override) return override(toolName, args);
    return { success: true, data: { id: 'sched-001' } };
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('BulkSchedulerTool', () => {
  let tool: BulkSchedulerTool;

  beforeEach(() => {
    tool = new BulkSchedulerTool();
  });

  /* ── Metadata ─────────────────────────────────────────────────── */

  describe('metadata', () => {
    it('should expose the correct id and name', () => {
      expect(tool.id).toBe('bulkSchedule');
      expect(tool.name).toBe('bulkSchedule');
    });

    it('should require posts in the input schema', () => {
      expect(tool.inputSchema.required).toEqual(['posts']);
    });

    it('should flag hasSideEffects as true', () => {
      expect(tool.hasSideEffects).toBe(true);
    });

    it('should describe itself as a bulk scheduler', () => {
      expect(tool.description).toContain('Schedule multiple social media posts');
    });
  });

  /* ── Empty posts validation ───────────────────────────────────── */

  describe('empty posts array', () => {
    it('should return error when posts array is empty', async () => {
      const result = await tool.execute({ posts: [] });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No posts provided');
    });

    it('should return error when posts is undefined', async () => {
      const result = await tool.execute({ posts: undefined as any });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No posts provided');
    });
  });

  /* ── Batch scheduling ─────────────────────────────────────────── */

  describe('batch scheduling', () => {
    it('should schedule multiple posts and return per-post results', async () => {
      const executor = createMockExecutor();
      tool.setToolExecutor(executor);

      const scheduledAt = futureISO(2);
      const result = await tool.execute({
        posts: [
          { content: 'Post 1', platforms: ['twitter'], scheduledAt },
          { content: 'Post 2', platforms: ['linkedin'], scheduledAt },
          { content: 'Post 3', platforms: ['instagram'], scheduledAt },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data!.total).toBe(3);
      expect(result.data!.scheduled).toBe(3);
      expect(result.data!.failed).toBe(0);
      expect(result.data!.results).toHaveLength(3);
      expect(executor).toHaveBeenCalledTimes(3);
    });

    it('should delegate to the schedulePost tool', async () => {
      const executor = createMockExecutor();
      tool.setToolExecutor(executor);

      const scheduledAt = futureISO();
      await tool.execute({
        posts: [{ content: 'Hello', platforms: ['twitter'], scheduledAt }],
      });

      expect(executor).toHaveBeenCalledWith('schedulePost', expect.objectContaining({
        content: 'Hello',
        platforms: ['twitter'],
        scheduledAt,
      }));
    });

    it('should pass mediaUrls and hashtags to the executor', async () => {
      const executor = createMockExecutor();
      tool.setToolExecutor(executor);

      const scheduledAt = futureISO();
      await tool.execute({
        posts: [{
          content: 'Media post',
          platforms: ['twitter'],
          scheduledAt,
          mediaUrls: ['https://example.com/photo.jpg'],
          hashtags: ['test'],
        }],
      });

      expect(executor).toHaveBeenCalledWith('schedulePost', expect.objectContaining({
        mediaUrls: ['https://example.com/photo.jpg'],
        hashtags: ['test'],
      }));
    });

    it('should include the index in each result', async () => {
      const executor = createMockExecutor();
      tool.setToolExecutor(executor);

      const scheduledAt = futureISO();
      const result = await tool.execute({
        posts: [
          { content: 'A', platforms: ['twitter'], scheduledAt },
          { content: 'B', platforms: ['linkedin'], scheduledAt },
        ],
      });

      expect(result.data!.results[0]!.index).toBe(0);
      expect(result.data!.results[1]!.index).toBe(1);
    });
  });

  /* ── Template variable expansion ──────────────────────────────── */

  describe('template variable expansion', () => {
    it('should expand {{date}} to the localized date string', async () => {
      const scheduledAt = '2025-06-15T10:00:00Z';
      const scheduledDate = new Date(scheduledAt);

      const result = await tool.execute({
        posts: [{ content: 'Posted on {{date}}', platforms: ['twitter'], scheduledAt }],
      });

      const expanded = result.data!.results[0]!.expandedContent;
      expect(expanded).toContain(scheduledDate.toLocaleDateString());
      expect(expanded).not.toContain('{{date}}');
    });

    it('should expand {{time}} to the localized time string', async () => {
      const scheduledAt = '2025-06-15T14:30:00Z';
      const scheduledDate = new Date(scheduledAt);

      const result = await tool.execute({
        posts: [{ content: 'At {{time}}', platforms: ['twitter'], scheduledAt }],
      });

      const expanded = result.data!.results[0]!.expandedContent;
      expect(expanded).toContain(scheduledDate.toLocaleTimeString());
      expect(expanded).not.toContain('{{time}}');
    });

    it('should expand {{day}} to the full weekday name', async () => {
      const scheduledAt = '2025-06-15T10:00:00Z'; // Sunday
      const scheduledDate = new Date(scheduledAt);
      const expectedDay = scheduledDate.toLocaleDateString('en', { weekday: 'long' });

      const result = await tool.execute({
        posts: [{ content: 'Happy {{day}}!', platforms: ['twitter'], scheduledAt }],
      });

      const expanded = result.data!.results[0]!.expandedContent;
      expect(expanded).toContain(expectedDay);
      expect(expanded).not.toContain('{{day}}');
    });

    it('should expand {{month}} to the full month name', async () => {
      const scheduledAt = '2025-06-15T10:00:00Z'; // June
      const scheduledDate = new Date(scheduledAt);
      const expectedMonth = scheduledDate.toLocaleDateString('en', { month: 'long' });

      const result = await tool.execute({
        posts: [{ content: 'Welcome to {{month}}', platforms: ['twitter'], scheduledAt }],
      });

      const expanded = result.data!.results[0]!.expandedContent;
      expect(expanded).toContain(expectedMonth);
    });

    it('should expand {{year}} to the four-digit year', async () => {
      const scheduledAt = '2025-06-15T10:00:00Z';

      const result = await tool.execute({
        posts: [{ content: 'Year is {{year}}', platforms: ['twitter'], scheduledAt }],
      });

      const expanded = result.data!.results[0]!.expandedContent;
      expect(expanded).toContain('2025');
      expect(expanded).not.toContain('{{year}}');
    });

    it('should expand {{iso}} to the full ISO 8601 string', async () => {
      const scheduledAt = '2025-06-15T10:00:00Z';
      const scheduledDate = new Date(scheduledAt);

      const result = await tool.execute({
        posts: [{ content: 'Timestamp: {{iso}}', platforms: ['twitter'], scheduledAt }],
      });

      const expanded = result.data!.results[0]!.expandedContent;
      expect(expanded).toContain(scheduledDate.toISOString());
      expect(expanded).not.toContain('{{iso}}');
    });

    it('should NOT expand {{platform}} (left for per-platform resolution)', async () => {
      const scheduledAt = futureISO();

      const result = await tool.execute({
        posts: [{ content: 'Posted on {{platform}}', platforms: ['twitter'], scheduledAt }],
      });

      const expanded = result.data!.results[0]!.expandedContent;
      expect(expanded).toContain('{{platform}}');
    });

    it('should expand multiple template variables in the same content', async () => {
      const scheduledAt = '2025-12-25T08:00:00Z';
      const scheduledDate = new Date(scheduledAt);

      const result = await tool.execute({
        posts: [{
          content: 'Merry Christmas {{year}}! Join us on {{day}} at {{time}}.',
          platforms: ['twitter'],
          scheduledAt,
        }],
      });

      const expanded = result.data!.results[0]!.expandedContent;
      expect(expanded).toContain('2025');
      expect(expanded).toContain(scheduledDate.toLocaleTimeString());
      expect(expanded).not.toContain('{{year}}');
      expect(expanded).not.toContain('{{day}}');
      expect(expanded).not.toContain('{{time}}');
    });
  });

  /* ── Validation ───────────────────────────────────────────────── */

  describe('validation', () => {
    it('should reject posts with invalid date strings', async () => {
      const result = await tool.execute({
        posts: [{ content: 'Bad date', platforms: ['twitter'], scheduledAt: 'not-a-date' }],
      });

      expect(result.success).toBe(false);
      expect(result.data!.results[0]!.status).toBe('error');
      expect(result.data!.results[0]!.error).toContain('Invalid scheduledAt date');
    });

    it('should reject posts with no platforms', async () => {
      const result = await tool.execute({
        posts: [{ content: 'No platforms', platforms: [], scheduledAt: futureISO() }],
      });

      expect(result.data!.results[0]!.status).toBe('error');
      expect(result.data!.results[0]!.error).toContain('No target platforms');
    });

    it('should reject posts with unsupported platforms', async () => {
      const result = await tool.execute({
        posts: [{
          content: 'Unknown platform',
          platforms: ['myspace', 'friendster'],
          scheduledAt: futureISO(),
        }],
      });

      expect(result.data!.results[0]!.status).toBe('error');
      expect(result.data!.results[0]!.error).toContain('Unsupported platform(s)');
      expect(result.data!.results[0]!.error).toContain('myspace');
      expect(result.data!.results[0]!.error).toContain('friendster');
    });

    it('should reject posts with empty content', async () => {
      const result = await tool.execute({
        posts: [{ content: '   ', platforms: ['twitter'], scheduledAt: futureISO() }],
      });

      expect(result.data!.results[0]!.status).toBe('error');
      expect(result.data!.results[0]!.error).toContain('content is empty');
    });

    it('should still accept posts scheduled in the past (backfill support)', async () => {
      const pastDate = '2020-01-01T00:00:00Z';

      const result = await tool.execute({
        posts: [{ content: 'Backdated post', platforms: ['twitter'], scheduledAt: pastDate }],
      });

      // No executor set, so standalone mode
      expect(result.data!.results[0]!.status).toBe('scheduled');
    });
  });

  /* ── Partial failures ─────────────────────────────────────────── */

  describe('partial failures', () => {
    it('should handle a mix of valid and invalid posts', async () => {
      const result = await tool.execute({
        posts: [
          { content: 'Valid post', platforms: ['twitter'], scheduledAt: futureISO() },
          { content: '', platforms: ['twitter'], scheduledAt: futureISO() }, // empty content
          { content: 'Also valid', platforms: ['linkedin'], scheduledAt: futureISO() },
        ],
      });

      expect(result.success).toBe(true); // at least one scheduled
      expect(result.data!.scheduled).toBe(2);
      expect(result.data!.failed).toBe(1);
    });

    it('should report success=false when all posts fail validation', async () => {
      const result = await tool.execute({
        posts: [
          { content: '', platforms: ['twitter'], scheduledAt: futureISO() },
          { content: 'Bad date', platforms: ['twitter'], scheduledAt: 'nope' },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.data!.scheduled).toBe(0);
      expect(result.data!.failed).toBe(2);
    });
  });

  /* ── Executor errors ──────────────────────────────────────────── */

  describe('executor errors', () => {
    it('should handle executor returning success=false', async () => {
      const executor = createMockExecutor(() => ({
        success: false,
        error: 'Scheduling service unavailable',
      }));
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        posts: [{ content: 'Test', platforms: ['twitter'], scheduledAt: futureISO() }],
      });

      expect(result.data!.results[0]!.status).toBe('error');
      expect(result.data!.results[0]!.error).toBe('Scheduling service unavailable');
    });

    it('should handle executor throwing an error', async () => {
      const executor = vi.fn(async () => {
        throw new Error('Timeout');
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        posts: [{ content: 'Test', platforms: ['twitter'], scheduledAt: futureISO() }],
      });

      expect(result.data!.results[0]!.status).toBe('error');
      expect(result.data!.results[0]!.error).toContain('Tool executor error');
      expect(result.data!.results[0]!.error).toContain('Timeout');
    });

    it('should handle executor throwing a non-Error value', async () => {
      const executor = vi.fn(async () => {
        throw 'raw-error'; // eslint-disable-line no-throw-literal
      });
      tool.setToolExecutor(executor);

      const result = await tool.execute({
        posts: [{ content: 'Test', platforms: ['twitter'], scheduledAt: futureISO() }],
      });

      expect(result.data!.results[0]!.status).toBe('error');
      expect(result.data!.results[0]!.error).toContain('raw-error');
    });
  });

  /* ── Standalone mode (no executor) ────────────────────────────── */

  describe('standalone mode (no executor)', () => {
    it('should run in validation/preview mode and mark valid posts as scheduled', async () => {
      const scheduledAt = futureISO();
      const result = await tool.execute({
        posts: [
          { content: 'Preview post 1', platforms: ['twitter'], scheduledAt },
          { content: 'Preview post 2', platforms: ['linkedin', 'facebook'], scheduledAt },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data!.scheduled).toBe(2);
      for (const r of result.data!.results) {
        expect(r.status).toBe('scheduled');
        expect(r.expandedContent).toBeDefined();
      }
    });

    it('should still expand template variables in standalone mode', async () => {
      const scheduledAt = '2025-06-15T10:00:00Z';

      const result = await tool.execute({
        posts: [{ content: 'Year: {{year}}', platforms: ['twitter'], scheduledAt }],
      });

      expect(result.data!.results[0]!.expandedContent).toContain('2025');
    });
  });

  /* ── Supported platforms ──────────────────────────────────────── */

  describe('supported platforms', () => {
    const allSupported = [
      'twitter', 'instagram', 'reddit', 'youtube', 'tiktok', 'pinterest',
      'linkedin', 'facebook', 'threads', 'bluesky', 'mastodon', 'farcaster',
      'lemmy', 'devto', 'medium',
    ];

    it('should accept all 15 supported platforms', async () => {
      const result = await tool.execute({
        posts: [{ content: 'All platforms', platforms: allSupported, scheduledAt: futureISO() }],
      });

      expect(result.data!.results[0]!.status).toBe('scheduled');
    });
  });
});
