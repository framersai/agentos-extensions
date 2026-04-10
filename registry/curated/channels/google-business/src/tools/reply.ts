// @ts-nocheck
import type { GoogleBusinessService } from '../GoogleBusinessService.js';

export class GbpReplyTool {
  readonly id = 'gbpReply';
  readonly name = 'gbpReply';
  readonly displayName = 'Reply to Review';
  readonly description = 'Reply to a customer review on Google Business Profile.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      reviewName: { type: 'string', description: 'Review resource name (e.g. "locations/123/reviews/456")' },
      comment: { type: 'string', description: 'Reply text' },
    },
    required: ['reviewName', 'comment'],
  };

  constructor(private service: GoogleBusinessService) {}

  async execute(args: { reviewName: string; comment: string }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.replyToReview(args.reviewName, args.comment);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
