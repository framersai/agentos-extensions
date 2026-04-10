// @ts-nocheck
/**
 * @fileoverview ITool for publishing blog articles to one or more platforms.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BlogPublisherService, BlogPlatform } from '../BlogPublisherService';

export class BlogPublishArticleTool implements ITool {
  public readonly id = 'blogPublishArticle';
  public readonly name = 'blogPublishArticle';
  public readonly displayName = 'Publish Blog Article';
  public readonly description =
    'Publish a Markdown article to one or more blog platforms (Dev.to, Hashnode, Medium, WordPress). ' +
    'If no platforms are specified, publishes to all configured platforms.';
  public readonly category = 'content';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['title', 'body'] as const,
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
        description: 'Target platforms (devto, hashnode, medium, wordpress). Defaults to all configured.',
        items: { type: 'string', enum: ['devto', 'hashnode', 'medium', 'wordpress'] },
      },
      coverImage: { type: 'string', description: 'URL of the cover image' },
      published: {
        type: 'boolean',
        description: 'If true, publish immediately. If false, save as draft. Defaults to false.',
      },
      canonicalUrl: { type: 'string', description: 'Canonical URL for SEO (original source)' },
      series: { type: 'string', description: 'Series name (Dev.to only)' },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      results: {
        type: 'array',
        description: 'Per-platform publish results',
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
    },
  };

  constructor(private readonly service: BlogPublisherService) {}

  async execute(
    args: {
      title: string;
      body: string;
      tags?: string[];
      platforms?: string[];
      coverImage?: string;
      published?: boolean;
      canonicalUrl?: string;
      series?: string;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const article = {
        title: args.title,
        body: args.body,
        tags: args.tags,
        coverImage: args.coverImage,
        published: args.published ?? false,
        canonicalUrl: args.canonicalUrl,
        series: args.series,
      };

      const results = await this.service.publishToAll(article, args.platforms);
      const successes = results.filter((r) => 'url' in r).length;
      const failures = results.length - successes;

      return {
        success: successes > 0,
        output: {
          results,
          summary: `Published to ${successes} platform(s)${failures > 0 ? `, ${failures} failed` : ''}.`,
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
    if (args.platforms && !Array.isArray(args.platforms)) errors.push('platforms must be an array');
    if (args.tags && !Array.isArray(args.tags)) errors.push('tags must be an array');
    return { isValid: errors.length === 0, errors };
  }
}
