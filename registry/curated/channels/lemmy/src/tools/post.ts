import type { LemmyService } from '../LemmyService.js';

export class LemmyPostTool {
  readonly id = 'lemmyPost';
  readonly name = 'lemmyPost';
  readonly displayName = 'Create Post';
  readonly description = 'Create a new post in a Lemmy community.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      communityId: { type: 'number', description: 'ID of the community to post in' },
      name: { type: 'string', description: 'Post title' },
      body: { type: 'string', description: 'Post body text (Markdown supported)' },
      url: { type: 'string', description: 'Optional URL to link' },
    },
    required: ['communityId', 'name'],
  };

  constructor(private service: LemmyService) {}

  async execute(args: { communityId: number; name: string; body?: string; url?: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.createPost(args.communityId, args.name, args.body, args.url);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
