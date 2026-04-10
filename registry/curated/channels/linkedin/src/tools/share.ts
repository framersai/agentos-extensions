// @ts-nocheck
import type { LinkedInService } from '../LinkedInService.js';

export class LinkedInShareTool {
  readonly id = 'linkedinShare';
  readonly name = 'linkedinShare';
  readonly displayName = 'Share Post';
  readonly description = 'Reshare a LinkedIn post with optional commentary.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      postId: { type: 'string', description: 'ID or URN of the LinkedIn post to reshare' },
      commentary: { type: 'string', description: 'Optional commentary to add when sharing' },
    },
    required: ['postId'],
  };

  constructor(private service: LinkedInService) {}

  async execute(args: { postId: string; commentary?: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.sharePost(args.postId, args.commentary);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
