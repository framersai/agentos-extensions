import type { FacebookService } from '../FacebookService.js';

export class FacebookShareTool {
  readonly id = 'facebookShare';
  readonly name = 'facebookShare';
  readonly displayName = 'Share Post';
  readonly description = 'Share a Facebook post to your feed with optional commentary.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      postId: { type: 'string', description: 'ID of the post to share' },
      commentary: { type: 'string', description: 'Optional text to accompany the share' },
    },
    required: ['postId'],
  };

  constructor(private service: FacebookService) {}

  async execute(args: { postId: string; commentary?: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.sharePost(args.postId, args.commentary);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
