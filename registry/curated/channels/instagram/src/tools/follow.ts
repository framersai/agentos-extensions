import type { InstagramService } from '../InstagramService.js';

export class InstagramFollowTool {
  readonly id = 'instagramFollow';
  readonly name = 'instagramFollow';
  readonly displayName = 'Follow/Unfollow';
  readonly description = 'Follow or unfollow an Instagram user. Note: Requires browser automation — Graph API does not support follow actions.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      userId: { type: 'string', description: 'Instagram user ID to follow/unfollow' },
      unfollow: { type: 'boolean', description: 'Set to true to unfollow', default: false },
    },
    required: ['userId'],
  };

  constructor(private _service: InstagramService) {}

  async execute(args: { userId: string; unfollow?: boolean }): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: `Instagram Graph API does not support ${args.unfollow ? 'unfollow' : 'follow'} actions. Use browser automation extension.`,
    };
  }
}
