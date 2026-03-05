/**
 * @fileoverview ITool for cross-posting articles from a source URL to blog platforms.
 *
 * Fetches the content from the source URL, then publishes it to the specified
 * platforms with the canonical URL set to the original source for SEO.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BlogPublisherService, BlogPlatform } from '../BlogPublisherService';

export class BlogCrossPostTool implements ITool {
  public readonly id = 'blogCrossPost';
  public readonly name = 'blogCrossPost';
  public readonly displayName = 'Cross-Post Blog Article';
  public readonly description =
    'Cross-post an article from a source URL to one or more blog platforms. ' +
    'Fetches the original content and publishes it with the canonical URL pointing ' +
    'back to the source for proper SEO attribution.';
  public readonly category = 'content';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['sourceUrl'] as const,
    properties: {
      sourceUrl: { type: 'string', description: 'URL of the original article to cross-post' },
      platforms: {
        type: 'array',
        description: 'Target platforms. Defaults to all configured.',
        items: { type: 'string', enum: ['devto', 'hashnode', 'medium', 'wordpress'] },
      },
      tags: {
        type: 'array',
        description: 'Tags to apply to the cross-posted article',
        items: { type: 'string' },
      },
      title: {
        type: 'string',
        description: 'Override the article title. If omitted, extracted from the source page.',
      },
      published: {
        type: 'boolean',
        description: 'If true, publish immediately. If false, save as draft. Defaults to false.',
      },
      coverImage: { type: 'string', description: 'Cover image URL (overrides source)' },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      sourceUrl: { type: 'string' },
      results: {
        type: 'array',
        description: 'Per-platform cross-post results',
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
      sourceUrl: string;
      platforms?: string[];
      tags?: string[];
      title?: string;
      published?: boolean;
      coverImage?: string;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      // Fetch content from the source URL
      const fetched = await this.service.fetchArticleContent(args.sourceUrl);

      const article = {
        title: args.title ?? fetched.title ?? 'Cross-Posted Article',
        body: fetched.body,
        tags: args.tags,
        canonicalUrl: args.sourceUrl, // Point back to original for SEO
        published: args.published ?? false,
        coverImage: args.coverImage,
      };

      const results = await this.service.publishToAll(article, args.platforms);
      const successes = results.filter((r) => 'url' in r).length;
      const failures = results.length - successes;

      return {
        success: successes > 0,
        output: {
          sourceUrl: args.sourceUrl,
          results,
          summary: `Cross-posted to ${successes} platform(s)${failures > 0 ? `, ${failures} failed` : ''}. Canonical URL: ${args.sourceUrl}`,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.sourceUrl || typeof args.sourceUrl !== 'string') {
      errors.push('sourceUrl is required and must be a string');
    } else {
      try {
        new URL(args.sourceUrl);
      } catch {
        errors.push('sourceUrl must be a valid URL');
      }
    }
    if (args.platforms && !Array.isArray(args.platforms)) errors.push('platforms must be an array');
    if (args.tags && !Array.isArray(args.tags)) errors.push('tags must be an array');
    return { isValid: errors.length === 0, errors };
  }
}
