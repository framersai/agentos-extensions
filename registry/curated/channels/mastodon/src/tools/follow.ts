// @ts-nocheck
import type { MastodonService } from '../MastodonService.js';

export class MastodonFollowTool {
  readonly id = 'mastodonFollow';
  readonly name = 'mastodonFollow';
  readonly displayName = 'Follow Account';
  readonly description = 'Follow or unfollow a Mastodon account.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      accountId: { type: 'string', description: 'ID of the account to follow' },
      undo: { type: 'boolean', description: 'Set to true to unfollow', default: false },
    },
    required: ['accountId'],
  };

  constructor(private service: MastodonService) {}

  async execute(args: { accountId: string; undo?: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      if (args.undo) {
        await this.service.unfollowAccount(args.accountId);
      } else {
        await this.service.followAccount(args.accountId);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
