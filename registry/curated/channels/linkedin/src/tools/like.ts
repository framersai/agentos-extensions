import type { LinkedInService } from '../LinkedInService.js';

export class LinkedInLikeTool {
  readonly id = 'linkedinLike';
  readonly name = 'linkedinLike';
  readonly displayName = 'Like Post';
  readonly description = 'Like or unlike a LinkedIn post.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      postId: { type: 'string', description: 'ID or URN of the LinkedIn post' },
      unlike: { type: 'boolean', description: 'Set to true to unlike', default: false },
    },
    required: ['postId'],
  };

  constructor(private service: LinkedInService) {}

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
