/**
 * @fileoverview ITool for retrieving blog article analytics.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BlogPublisherService, BlogPlatform } from '../BlogPublisherService';

export class BlogAnalyticsTool implements ITool {
  public readonly id = 'blogAnalytics';
  public readonly name = 'blogAnalytics';
  public readonly displayName = 'Blog Article Analytics';
  public readonly description =
    'Retrieve analytics for a specific blog article. ' +
    'Currently only Dev.to provides per-article analytics via API (views, reactions, comments). ' +
    'Other platforms require using their web dashboards.';
  public readonly category = 'content';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['platform', 'articleId'] as const,
    properties: {
      platform: {
        type: 'string',
        description: 'Platform to retrieve analytics from',
        enum: ['devto'],
      },
      articleId: { type: 'string', description: 'Platform-specific article ID' },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      platform: { type: 'string' },
      articleId: { type: 'string' },
      title: { type: 'string' },
      views: { type: 'number', description: 'Page view count' },
      reactions: { type: 'number', description: 'Positive reaction count' },
      comments: { type: 'number', description: 'Comment count' },
      reads: { type: 'number', description: 'Read count (if available)' },
      fans: { type: 'number', description: 'Fan/clap count (if available)' },
      extra: { type: 'object', description: 'Additional platform-specific metrics' },
    },
  };

  constructor(private readonly service: BlogPublisherService) {}

  async execute(
    args: { platform: string; articleId: string },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const analytics = await this.service.getAnalytics(
        args.platform as BlogPlatform,
        args.articleId,
      );

      return { success: true, output: analytics };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.platform || typeof args.platform !== 'string') {
      errors.push('platform is required and must be a string');
    } else if (args.platform !== 'devto') {
      errors.push('Only Dev.to supports per-article analytics via API. Use the platform dashboard for others.');
    }
    if (!args.articleId || typeof args.articleId !== 'string') {
      errors.push('articleId is required and must be a string');
    }
    return { isValid: errors.length === 0, errors };
  }
}
