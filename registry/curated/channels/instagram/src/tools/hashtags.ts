import type { InstagramService } from '../InstagramService.js';

export class InstagramHashtagsTool {
  readonly id = 'instagramHashtags';
  readonly name = 'instagramHashtags';
  readonly displayName = 'Hashtag Research';
  readonly description = 'Research Instagram hashtag performance — search for hashtags and view top media.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      hashtag: { type: 'string', description: 'Hashtag to research (without #)' },
      action: { type: 'string', enum: ['search', 'topMedia'], description: 'search to find hashtag, topMedia to get its top posts', default: 'search' },
      hashtagId: { type: 'string', description: 'Hashtag ID (required for topMedia action)' },
    },
    required: ['hashtag'],
  };

  constructor(private service: InstagramService) {}

  async execute(args: { hashtag: string; action?: string; hashtagId?: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (args.action === 'topMedia' && args.hashtagId) {
        const media = await this.service.getHashtagTopMedia(args.hashtagId);
        return { success: true, data: media };
      }
      const result = await this.service.searchHashtag(args.hashtag);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
