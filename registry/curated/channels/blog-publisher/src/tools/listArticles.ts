/**
 * @fileoverview ITool for listing blog articles across platforms.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BlogPublisherService, BlogPlatform } from '../BlogPublisherService';

export class BlogListArticlesTool implements ITool {
  public readonly id = 'blogListArticles';
  public readonly name = 'blogListArticles';
  public readonly displayName = 'List Blog Articles';
  public readonly description =
    'List published and draft articles from blog platforms. ' +
    'Specify a platform to list from one, or omit to list from all configured platforms. ' +
    'Medium does not support listing via API.';
  public readonly category = 'content';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: [] as const,
    properties: {
      platform: {
        type: 'string',
        description: 'Platform to list from. Omit to list from all configured platforms.',
        enum: ['devto', 'hashnode', 'wordpress'],
      },
      limit: {
        type: 'number',
        description: 'Maximum number of articles to return per platform. Defaults to 30.',
      },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      articles: {
        type: 'array',
        description: 'List of articles across platforms',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string' },
            id: { type: 'string' },
            title: { type: 'string' },
            url: { type: 'string' },
            published: { type: 'boolean' },
            publishedAt: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      total: { type: 'number' },
    },
  };

  constructor(private readonly service: BlogPublisherService) {}

  async execute(
    args: { platform?: string; limit?: number },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const articles = await this.service.listArticles(
        args.platform as BlogPlatform | undefined,
        args.limit,
      );

      return {
        success: true,
        output: {
          articles,
          total: articles.length,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const validPlatforms = ['devto', 'hashnode', 'wordpress'];
    if (args.platform && !validPlatforms.includes(args.platform)) {
      errors.push(`platform must be one of: ${validPlatforms.join(', ')}. Medium does not support listing.`);
    }
    if (args.limit !== undefined && (typeof args.limit !== 'number' || args.limit < 1)) {
      errors.push('limit must be a positive number');
    }
    return { isValid: errors.length === 0, errors };
  }
}
