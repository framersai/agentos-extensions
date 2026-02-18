import type { InstagramService } from '../InstagramService.js';

export class InstagramLikeTool {
  readonly id = 'instagramLike';
  readonly name = 'instagramLike';
  readonly displayName = 'Like Post';
  readonly description = 'Like an Instagram post. Note: Graph API does not natively support liking — requires browser automation for full support.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      mediaId: { type: 'string', description: 'Instagram media ID to like' },
    },
    required: ['mediaId'],
  };

  constructor(private service: InstagramService) {}

  async execute(args: { mediaId: string }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.likeMedia(args.mediaId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
