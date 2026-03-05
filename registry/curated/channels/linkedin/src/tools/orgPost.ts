import type { LinkedInService } from '../LinkedInService.js';

export class LinkedInOrgPostTool {
  readonly id = 'linkedinOrgPost';
  readonly name = 'linkedinOrgPost';
  readonly displayName = 'Post to Company Page';
  readonly description = 'Post to a LinkedIn company/organization page. Requires admin access to the organization.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      organizationId: { type: 'string', description: 'LinkedIn organization ID (numeric)' },
      text: { type: 'string', description: 'Post text content' },
      mediaPath: { type: 'string', description: 'Optional URL or path to media file (image/video)' },
      articleUrl: { type: 'string', description: 'Optional URL of article to share' },
      articleTitle: { type: 'string', description: 'Title for the article link preview' },
      visibility: { type: 'string', enum: ['PUBLIC', 'CONNECTIONS'], description: 'Post visibility (default PUBLIC)' },
    },
    required: ['organizationId', 'text'],
  };

  constructor(private service: LinkedInService) {}

  async execute(args: { organizationId: string; text: string; mediaPath?: string; articleUrl?: string; articleTitle?: string; visibility?: 'PUBLIC' | 'CONNECTIONS' }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.postToFeed({
        text: args.text,
        organizationId: args.organizationId,
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
