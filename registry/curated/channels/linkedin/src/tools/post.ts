import type { LinkedInService } from '../LinkedInService.js';

export class LinkedInPostTool {
  readonly id = 'linkedinPost';
  readonly name = 'linkedinPost';
  readonly displayName = 'Post to LinkedIn';
  readonly description = 'Post to LinkedIn with text, optional image/video, or article link. Supports visibility control.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Post text content' },
      mediaPath: { type: 'string', description: 'URL or local path to media file (image/video) to attach' },
      articleUrl: { type: 'string', description: 'URL of article to share' },
      articleTitle: { type: 'string', description: 'Title for the article link preview' },
      visibility: { type: 'string', enum: ['PUBLIC', 'CONNECTIONS'], description: 'Post visibility (default PUBLIC)' },
    },
    required: ['text'],
  };

  constructor(private service: LinkedInService) {}

  async execute(args: { text: string; mediaPath?: string; articleUrl?: string; articleTitle?: string; visibility?: 'PUBLIC' | 'CONNECTIONS' }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.postToFeed({
        text: args.text,
        mediaUrls: args.mediaPath ? [args.mediaPath] : undefined,
        articleUrl: args.articleUrl,
        articleTitle: args.articleTitle,
        visibility: args.visibility,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
