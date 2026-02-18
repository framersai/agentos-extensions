import type { InstagramService } from '../InstagramService.js';

export class InstagramPostTool {
  readonly id = 'instagramPost';
  readonly name = 'instagramPost';
  readonly displayName = 'Post Photo/Carousel';
  readonly description = 'Post a photo or multi-image carousel to Instagram with a caption.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      imageUrls: { type: 'array', items: { type: 'string' }, description: 'Image URLs (1 for single post, 2+ for carousel)' },
      caption: { type: 'string', description: 'Post caption with hashtags' },
    },
    required: ['imageUrls'],
  };

  constructor(private service: InstagramService) {}

  async execute(args: { imageUrls: string[]; caption?: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (args.imageUrls.length > 1) {
        const items = args.imageUrls.map((url) => ({ imageUrl: url }));
        const result = await this.service.postCarousel(items, args.caption);
        return { success: true, data: result };
      }
      const result = await this.service.postPhoto(args.imageUrls[0], args.caption);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
