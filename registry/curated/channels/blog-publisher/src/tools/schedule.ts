// @ts-nocheck
/**
 * @fileoverview ITool for scheduling blog articles for future publication.
 *
 * Since most blog platform APIs do not expose native scheduling, this tool
 * creates articles as drafts and attaches scheduled metadata. An external
 * scheduler (cron, agent loop, etc.) can later publish them at the target time.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BlogPublisherService, BlogPlatform } from '../BlogPublisherService';

export class BlogScheduleTool implements ITool {
  public readonly id = 'blogSchedule';
  public readonly name = 'blogSchedule';
  public readonly displayName = 'Schedule Blog Article';
  public readonly description =
    'Schedule an article for future publication by saving it as a draft with scheduled metadata. ' +
    'The article is created as a draft on the target platforms. An external scheduler must ' +
    'trigger publication at the specified time.';
  public readonly category = 'content';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['title', 'body', 'scheduledTime'] as const,
    properties: {
      title: { type: 'string', description: 'Article title' },
      body: { type: 'string', description: 'Article body in Markdown format' },
      tags: {
        type: 'array',
        description: 'Tags/topics for the article',
        items: { type: 'string' },
      },
      platforms: {
        type: 'array',
        description: 'Target platforms. Defaults to all configured.',
        items: { type: 'string', enum: ['devto', 'hashnode', 'medium', 'wordpress'] },
      },
      scheduledTime: {
        type: 'string',
        description: 'ISO 8601 datetime for when the article should be published (e.g. "2025-01-15T09:00:00Z")',
      },
      coverImage: { type: 'string', description: 'URL of the cover image' },
      canonicalUrl: { type: 'string', description: 'Canonical URL for SEO' },
      series: { type: 'string', description: 'Series name (Dev.to only)' },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      results: {
        type: 'array',
        description: 'Per-platform draft creation results',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string' },
            id: { type: 'string' },
            url: { type: 'string' },
            title: { type: 'string' },
            published: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
      scheduledTime: { type: 'string' },
    },
  };

  constructor(private readonly service: BlogPublisherService) {}

  async execute(
    args: {
      title: string;
      body: string;
      tags?: string[];
      platforms?: string[];
      scheduledTime: string;
      coverImage?: string;
      canonicalUrl?: string;
      series?: string;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      // Validate scheduled time is in the future
      const scheduledDate = new Date(args.scheduledTime);
      if (isNaN(scheduledDate.getTime())) {
        return { success: false, error: 'scheduledTime must be a valid ISO 8601 datetime string.' };
      }
      if (scheduledDate.getTime() <= Date.now()) {
        return { success: false, error: 'scheduledTime must be in the future.' };
      }

      // Append scheduling metadata to the article body as a front-matter comment
      const scheduleMeta = `<!-- scheduled: ${args.scheduledTime} -->`;
      const bodyWithMeta = `${scheduleMeta}\n\n${args.body}`;

      const article = {
        title: args.title,
        body: bodyWithMeta,
        tags: args.tags,
        coverImage: args.coverImage,
        canonicalUrl: args.canonicalUrl,
        series: args.series,
        published: false, // Always create as draft for scheduling
      };

      const results = await this.service.publishToAll(article, args.platforms);
      const successes = results.filter((r) => 'url' in r).length;
      const failures = results.length - successes;

      return {
        success: successes > 0,
        output: {
          results,
          scheduledTime: args.scheduledTime,
          summary: `Scheduled ${successes} draft(s) for ${args.scheduledTime}${failures > 0 ? `, ${failures} failed` : ''}.`,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.title || typeof args.title !== 'string') errors.push('title is required and must be a string');
    if (!args.body || typeof args.body !== 'string') errors.push('body is required and must be a string');
    if (!args.scheduledTime || typeof args.scheduledTime !== 'string') {
      errors.push('scheduledTime is required and must be an ISO 8601 datetime string');
    } else {
      const d = new Date(args.scheduledTime);
      if (isNaN(d.getTime())) errors.push('scheduledTime must be a valid ISO 8601 datetime');
    }
    if (args.platforms && !Array.isArray(args.platforms)) errors.push('platforms must be an array');
    if (args.tags && !Array.isArray(args.tags)) errors.push('tags must be an array');
    return { isValid: errors.length === 0, errors };
  }
}
