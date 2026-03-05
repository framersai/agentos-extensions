import type { FacebookService } from '../FacebookService.js';

export class FacebookPagePostTool {
  readonly id = 'facebookPagePost';
  readonly name = 'facebookPagePost';
  readonly displayName = 'Post to Page';
  readonly description = 'Post specifically to a managed Facebook page with text, optional link, or media.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      pageId: { type: 'string', description: 'ID of the managed page' },
      text: { type: 'string', description: 'Post text content' },
      link: { type: 'string', description: 'URL to attach to the post' },
      mediaPath: { type: 'string', description: 'URL of photo or video to attach' },
    },
    required: ['pageId', 'text'],
  };

  constructor(private service: FacebookService) {}

  async execute(args: {
    pageId: string;
    text: string;
    link?: string;
    mediaPath?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.postToPage(args.pageId, {
        message: args.text,
        link: args.link,
        photoUrl: args.mediaPath,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
