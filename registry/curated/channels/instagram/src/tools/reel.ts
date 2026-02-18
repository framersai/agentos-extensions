import type { InstagramService } from '../InstagramService.js';

export class InstagramReelTool {
  readonly id = 'instagramReel';
  readonly name = 'instagramReel';
  readonly displayName = 'Upload Reel';
  readonly description = 'Upload a short-form video as an Instagram Reel.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      videoUrl: { type: 'string', description: 'URL of the video file' },
      caption: { type: 'string', description: 'Reel caption with hashtags' },
      coverUrl: { type: 'string', description: 'Cover image URL' },
    },
    required: ['videoUrl'],
  };

  constructor(private service: InstagramService) {}

  async execute(args: { videoUrl: string; caption?: string; coverUrl?: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.postReel(args.videoUrl, args.caption, args.coverUrl);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
