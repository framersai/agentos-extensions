// @ts-nocheck
/**
 * @fileoverview BlueskyFollowTool — follow or unfollow a user on Bluesky.
 *
 * Resolves a handle to a DID before following.
 * Unfollowing requires the follow record URI from a prior follow operation.
 */

import type { BlueskyService } from '../BlueskyService.js';

export class BlueskyFollowTool {
  readonly id = 'blueskyFollow';
  readonly name = 'blueskyFollow';
  readonly displayName = 'Follow User';
  readonly description = 'Follow or unfollow a user on Bluesky by handle.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      handle: { type: 'string', description: 'Bluesky handle to follow (e.g. "alice.bsky.social")' },
      unfollow: { type: 'boolean', description: 'Set to true to unfollow (handle should then be the follow record URI)', default: false },
    },
    required: ['handle'],
  };

  constructor(private service: BlueskyService) {}

  async execute(args: { handle: string; unfollow?: boolean }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (args.unfollow) {
        // When unfollowing, the "handle" field is used as the follow record URI
        await this.service.unfollow(args.handle);
        return { success: true };
      } else {
        // Resolve handle to DID, then follow
        const did = await this.service.resolveHandle(args.handle);
        const result = await this.service.follow(did);
        return { success: true, data: { did, followUri: result.uri } };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
