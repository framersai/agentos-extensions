// @ts-nocheck
/**
 * @fileoverview BlueskyRepostTool — repost or undo a repost on Bluesky.
 *
 * Reposting requires the post URI and CID.
 * Undoing a repost requires the repost record URI returned from a prior repost operation.
 */

import type { BlueskyService } from '../BlueskyService.js';

export class BlueskyRepostTool {
  readonly id = 'blueskyRepost';
  readonly name = 'blueskyRepost';
  readonly displayName = 'Repost';
  readonly description = 'Repost or undo a repost on Bluesky.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      uri: { type: 'string', description: 'AT URI of the post to repost' },
      cid: { type: 'string', description: 'CID of the post to repost' },
      undo: { type: 'boolean', description: 'Set to true to undo repost (uri should then be the repost record URI)', default: false },
    },
    required: ['uri', 'cid'],
  };

  constructor(private service: BlueskyService) {}

  async execute(args: { uri: string; cid: string; undo?: boolean }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (args.undo) {
        await this.service.unrepost(args.uri);
        return { success: true };
      } else {
        const result = await this.service.repost(args.uri, args.cid);
        return { success: true, data: result };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
