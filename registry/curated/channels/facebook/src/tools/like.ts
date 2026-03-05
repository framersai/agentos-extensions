import type { FacebookService } from '../FacebookService.js';

export class FacebookLikeTool {
  readonly id = 'facebookLike';
  readonly name = 'facebookLike';
  readonly displayName = 'Like Post';
  readonly description = 'Like or unlike a Facebook post.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      postId: { type: 'string', description: 'ID of the post' },
      unlike: { type: 'boolean', description: 'Set to true to unlike', default: false },
    },
    required: ['postId'],
  };

  constructor(private service: FacebookService) {}

  async execute(args: { postId: string; unlike?: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      if (args.unlike) {
        await this.service.unlikePost(args.postId);
      } else {
        await this.service.likePost(args.postId);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
