/**
 * @fileoverview BlueskyLikeTool — like or unlike a post on Bluesky.
 *
 * Liking requires the post URI and CID.
 * Unliking requires the like record URI returned from a prior like operation.
 */

import type { BlueskyService } from '../BlueskyService.js';

export class BlueskyLikeTool {
  readonly id = 'blueskyLike';
  readonly name = 'blueskyLike';
  readonly displayName = 'Like Post';
  readonly description = 'Like or unlike a Bluesky post.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      uri: { type: 'string', description: 'AT URI of the post to like' },
      cid: { type: 'string', description: 'CID of the post to like' },
      unlike: { type: 'boolean', description: 'Set to true to unlike (uri should then be the like record URI)', default: false },
    },
    required: ['uri', 'cid'],
  };

  constructor(private service: BlueskyService) {}

  async execute(args: { uri: string; cid: string; unlike?: boolean }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (args.unlike) {
        await this.service.unlike(args.uri);
        return { success: true };
      } else {
        const result = await this.service.like(args.uri, args.cid);
        return { success: true, data: result };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
