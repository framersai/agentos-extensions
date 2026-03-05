/**
 * @fileoverview BlueskyReplyTool — reply to an existing Bluesky post.
 *
 * AT Protocol requires both a parent and root reference for thread replies.
 * If root is not provided, the parent is assumed to be the thread root.
 */

import type { BlueskyService } from '../BlueskyService.js';

export class BlueskyReplyTool {
  readonly id = 'blueskyReply';
  readonly name = 'blueskyReply';
  readonly displayName = 'Reply to Post';
  readonly description = 'Reply to an existing Bluesky post. Requires the parent post URI and CID; root URI/CID defaults to the parent if not provided.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      parentUri: { type: 'string', description: 'AT URI of the post to reply to' },
      parentCid: { type: 'string', description: 'CID of the post to reply to' },
      rootUri: { type: 'string', description: 'AT URI of the thread root (defaults to parent)' },
      rootCid: { type: 'string', description: 'CID of the thread root (defaults to parent)' },
      text: { type: 'string', description: 'Reply text' },
    },
    required: ['parentUri', 'parentCid', 'text'],
  };

  constructor(private service: BlueskyService) {}

  async execute(args: {
    parentUri: string;
    parentCid: string;
    rootUri?: string;
    rootCid?: string;
    text: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const rootUri = args.rootUri ?? args.parentUri;
      const rootCid = args.rootCid ?? args.parentCid;

      const result = await this.service.reply(
        args.parentUri,
        args.parentCid,
        rootUri,
        rootCid,
        args.text,
      );

      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
