import type { ThreadsService } from '../ThreadsService.js';

export class ThreadsReplyTool {
  readonly id = 'threadsReply';
  readonly name = 'threadsReply';
  readonly displayName = 'Reply to Thread';
  readonly description = 'Reply to an existing Threads post with text and optional media.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      postId: { type: 'string', description: 'ID of the Threads post to reply to' },
      text: { type: 'string', description: 'Reply text' },
      mediaUrl: { type: 'string', description: 'Optional image or video URL to attach' },
    },
    required: ['postId', 'text'],
  };

  constructor(private service: ThreadsService) {}

  async execute(args: { postId: string; text: string; mediaUrl?: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.replyToPost(args.postId, args.text, args.mediaUrl);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
