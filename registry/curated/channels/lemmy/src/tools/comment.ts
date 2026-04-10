// @ts-nocheck
import type { LemmyService } from '../LemmyService.js';

export class LemmyCommentTool {
  readonly id = 'lemmyComment';
  readonly name = 'lemmyComment';
  readonly displayName = 'Create Comment';
  readonly description = 'Create a comment on a Lemmy post, optionally as a reply to another comment.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      postId: { type: 'number', description: 'ID of the post to comment on' },
      content: { type: 'string', description: 'Comment text (Markdown supported)' },
      parentId: { type: 'number', description: 'ID of parent comment for threaded replies' },
    },
    required: ['postId', 'content'],
  };

  constructor(private service: LemmyService) {}

  async execute(args: { postId: number; content: string; parentId?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.createComment(args.postId, args.content, args.parentId);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
