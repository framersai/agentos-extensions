import type { LemmyService } from '../LemmyService.js';

export class LemmyVoteTool {
  readonly id = 'lemmyVote';
  readonly name = 'lemmyVote';
  readonly displayName = 'Vote';
  readonly description = 'Upvote, downvote, or reset vote on a Lemmy post or comment.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      type: { type: 'string', enum: ['post', 'comment'], description: 'Whether to vote on a post or comment' },
      id: { type: 'number', description: 'ID of the post or comment' },
      score: { type: 'number', enum: [1, 0, -1], description: '1 = upvote, -1 = downvote, 0 = reset vote' },
    },
    required: ['type', 'id', 'score'],
  };

  constructor(private service: LemmyService) {}

  async execute(args: { type: 'post' | 'comment'; id: number; score: 1 | 0 | -1 }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.vote(args.type, args.id, args.score);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
