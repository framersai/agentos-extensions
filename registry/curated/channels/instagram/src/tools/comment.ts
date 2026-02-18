import type { InstagramService } from '../InstagramService.js';

export class InstagramCommentTool {
  readonly id = 'instagramComment';
  readonly name = 'instagramComment';
  readonly displayName = 'Comment on Post';
  readonly description = 'Post a comment on an Instagram media item.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      mediaId: { type: 'string', description: 'Instagram media ID to comment on' },
      text: { type: 'string', description: 'Comment text' },
    },
    required: ['mediaId', 'text'],
  };

  constructor(private service: InstagramService) {}

  async execute(args: { mediaId: string; text: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.commentOnMedia(args.mediaId, args.text);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
