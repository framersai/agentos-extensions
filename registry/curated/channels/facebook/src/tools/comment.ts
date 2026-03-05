import type { FacebookService } from '../FacebookService.js';

export class FacebookCommentTool {
  readonly id = 'facebookComment';
  readonly name = 'facebookComment';
  readonly displayName = 'Comment on Post';
  readonly description = 'Add a comment to a Facebook post.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      postId: { type: 'string', description: 'ID of the post to comment on' },
      text: { type: 'string', description: 'Comment text' },
    },
    required: ['postId', 'text'],
  };

  constructor(private service: FacebookService) {}

  async execute(args: { postId: string; text: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.commentOnPost(args.postId, args.text);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
