/**
 * @fileoverview ITool for updating an existing blog article on a specific platform.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BlogPublisherService, BlogPlatform } from '../BlogPublisherService';

export class BlogUpdateArticleTool implements ITool {
  public readonly id = 'blogUpdateArticle';
  public readonly name = 'blogUpdateArticle';
  public readonly displayName = 'Update Blog Article';
  public readonly description =
    'Update an existing article on a specific blog platform. ' +
    'Supports Dev.to, Hashnode, and WordPress. Medium does not support post-publish updates.';
  public readonly category = 'content';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['platform', 'articleId'] as const,
    properties: {
      platform: {
        type: 'string',
        description: 'Target platform',
        enum: ['devto', 'hashnode', 'wordpress'],
      },
      articleId: { type: 'string', description: 'Platform-specific article/post ID' },
      title: { type: 'string', description: 'Updated title' },
      body: { type: 'string', description: 'Updated body in Markdown' },
      tags: {
        type: 'array',
        description: 'Updated tags',
        items: { type: 'string' },
      },
      published: { type: 'boolean', description: 'Change publish status' },
      coverImage: { type: 'string', description: 'Updated cover image URL' },
      canonicalUrl: { type: 'string', description: 'Updated canonical URL' },
      series: { type: 'string', description: 'Updated series name (Dev.to only)' },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      platform: { type: 'string' },
      id: { type: 'string' },
      url: { type: 'string' },
      title: { type: 'string' },
      published: { type: 'boolean' },
    },
  };

  constructor(private readonly service: BlogPublisherService) {}

  async execute(
    args: {
      platform: string;
      articleId: string;
      title?: string;
      body?: string;
      tags?: string[];
      published?: boolean;
      coverImage?: string;
      canonicalUrl?: string;
      series?: string;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const updates = {
        title: args.title,
        body: args.body,
        tags: args.tags,
        published: args.published,
        coverImage: args.coverImage,
        canonicalUrl: args.canonicalUrl,
        series: args.series,
      };

      const result = await this.service.updateOnPlatform(
        args.platform as BlogPlatform,
        args.articleId,
        updates,
      );

      return { success: true, output: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const validPlatforms = ['devto', 'hashnode', 'wordpress'];
    if (!args.platform || typeof args.platform !== 'string') {
      errors.push('platform is required and must be a string');
    } else if (!validPlatforms.includes(args.platform)) {
      errors.push(`platform must be one of: ${validPlatforms.join(', ')}. Medium does not support updates.`);
    }
    if (!args.articleId || typeof args.articleId !== 'string') {
      errors.push('articleId is required and must be a string');
    }
    return { isValid: errors.length === 0, errors };
  }
}
