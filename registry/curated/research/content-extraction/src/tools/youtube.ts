import type { ContentExtractionService } from '../ContentExtractionService.js';

export class ExtractYouTubeTool {
  readonly id = 'extractYoutube';
  readonly name = 'extractYoutube';
  readonly displayName = 'Extract YouTube Transcript';
  readonly description = 'Get YouTube video transcript and metadata from a video ID or URL.';
  readonly category = 'research';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      videoId: { type: 'string', description: 'YouTube video ID or full URL (e.g., "dQw4w9WgXcQ" or "https://www.youtube.com/watch?v=dQw4w9WgXcQ")' },
    },
    required: ['videoId'],
  };

  constructor(private service: ContentExtractionService) {}

  async execute(args: {
    videoId: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.extractYouTube(args.videoId);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
