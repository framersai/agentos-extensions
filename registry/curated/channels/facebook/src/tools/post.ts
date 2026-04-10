// @ts-nocheck
import type { FacebookService } from '../FacebookService.js';

export class FacebookPostTool {
  readonly id = 'facebookPost';
  readonly name = 'facebookPost';
  readonly displayName = 'Post to Facebook';
  readonly description = 'Post to a Facebook page or personal profile with text, optional link, photo, or video.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Post text content' },
      link: { type: 'string', description: 'URL to attach to the post' },
      mediaPath: { type: 'string', description: 'URL of photo or video to attach' },
      mediaType: { type: 'string', enum: ['photo', 'video'], description: 'Type of media attachment' },
      pageId: { type: 'string', description: 'Page ID to post to (omit for personal profile)' },
    },
    required: ['text'],
  };

  constructor(private service: FacebookService) {}

  async execute(args: {
    text: string;
    link?: string;
    mediaPath?: string;
    mediaType?: 'photo' | 'video';
    pageId?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (args.pageId) {
        const result = await this.service.postToPage(args.pageId, {
          message: args.text,
          link: args.link,
          photoUrl: args.mediaType === 'photo' ? args.mediaPath : undefined,
          videoUrl: args.mediaType === 'video' ? args.mediaPath : undefined,
        });
        return { success: true, data: result };
      }

      // Post to personal profile
      const result = await this.service.postToProfile({
        message: args.text,
        link: args.link,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
