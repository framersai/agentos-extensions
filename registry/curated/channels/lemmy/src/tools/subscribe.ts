// @ts-nocheck
import type { LemmyService } from '../LemmyService.js';

export class LemmySubscribeTool {
  readonly id = 'lemmySubscribe';
  readonly name = 'lemmySubscribe';
  readonly displayName = 'Subscribe to Community';
  readonly description = 'Subscribe to or unsubscribe from a Lemmy community.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      communityId: { type: 'number', description: 'ID of the community' },
      follow: { type: 'boolean', description: 'true to subscribe, false to unsubscribe (default true)' },
    },
    required: ['communityId'],
  };

  constructor(private service: LemmyService) {}

  async execute(args: { communityId: number; follow?: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.subscribeToCommunity(args.communityId, args.follow ?? true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
