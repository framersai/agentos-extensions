import type { ThreadsService } from '../ThreadsService.js';

export class ThreadsQuoteTool {
  readonly id = 'threadsQuote';
  readonly name = 'threadsQuote';
  readonly displayName = 'Quote Thread Post';
  readonly description = 'Quote an existing Threads post with your own comment.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      postId: { type: 'string', description: 'ID of the Threads post to quote' },
      text: { type: 'string', description: 'Your quote comment' },
    },
    required: ['postId', 'text'],
  };

  constructor(private service: ThreadsService) {}

  async execute(args: { postId: string; text: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.quotePost(args.postId, args.text);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
