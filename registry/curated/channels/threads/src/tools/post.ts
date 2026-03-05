import type { ThreadsService, CarouselItem } from '../ThreadsService.js';

export class ThreadsPostTool {
  readonly id = 'threadsPost';
  readonly name = 'threadsPost';
  readonly displayName = 'Post to Threads';
  readonly description = 'Create a post on Threads with text, optional image, video, or carousel items.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Post text (max 500 characters)' },
      imageUrl: { type: 'string', description: 'URL of image to attach' },
      videoUrl: { type: 'string', description: 'URL of video to attach' },
      carouselItems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['IMAGE', 'VIDEO'], description: 'Media type' },
            url: { type: 'string', description: 'Media URL' },
          },
          required: ['type', 'url'],
        },
        description: 'Carousel items (array of image/video objects)',
      },
    },
    required: ['text'],
  };

  constructor(private service: ThreadsService) {}

  async execute(args: {
    text: string;
    imageUrl?: string;
    videoUrl?: string;
    carouselItems?: CarouselItem[];
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      let result;

      if (args.carouselItems?.length) {
        result = await this.service.createCarouselPost(args.text, args.carouselItems);
      } else if (args.videoUrl) {
        result = await this.service.createVideoPost(args.text, args.videoUrl);
      } else if (args.imageUrl) {
        result = await this.service.createImagePost(args.text, args.imageUrl);
      } else {
        result = await this.service.createTextPost(args.text);
      }

      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
