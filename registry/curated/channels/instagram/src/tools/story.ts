import type { InstagramService } from '../InstagramService.js';

export class InstagramStoryTool {
  readonly id = 'instagramStory';
  readonly name = 'instagramStory';
  readonly displayName = 'Post Story';
  readonly description = 'Post an image as an Instagram Story (disappears after 24 hours).';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      imageUrl: { type: 'string', description: 'URL of the image to post as a story' },
    },
    required: ['imageUrl'],
  };

  constructor(private service: InstagramService) {}

  async execute(args: { imageUrl: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.postStory(args.imageUrl);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
