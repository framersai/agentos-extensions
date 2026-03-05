import type { GoogleBusinessService } from '../GoogleBusinessService.js';

export class GbpCreatePostTool {
  readonly id = 'gbpCreatePost';
  readonly name = 'gbpCreatePost';
  readonly displayName = 'Create Local Post';
  readonly description = 'Create a local post on Google Business Profile with text, optional media, and call-to-action.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      locationName: { type: 'string', description: 'Location resource name (e.g. "locations/123")' },
      summary: { type: 'string', description: 'Post text content' },
      topicType: { type: 'string', enum: ['STANDARD', 'EVENT', 'OFFER'], description: 'Post type (default "STANDARD")' },
      callToActionType: { type: 'string', description: 'CTA button type (e.g. "LEARN_MORE", "BOOK", "ORDER", "SHOP", "SIGN_UP", "CALL")' },
      callToActionUrl: { type: 'string', description: 'CTA button URL' },
      mediaUrl: { type: 'string', description: 'URL of image to attach' },
    },
    required: ['locationName', 'summary'],
  };

  constructor(private service: GoogleBusinessService) {}

  async execute(args: {
    locationName: string;
    summary: string;
    topicType?: 'STANDARD' | 'EVENT' | 'OFFER';
    callToActionType?: string;
    callToActionUrl?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const callToAction = args.callToActionType && args.callToActionUrl
        ? { actionType: args.callToActionType, url: args.callToActionUrl }
        : undefined;

      const media = args.mediaUrl
        ? { mediaFormat: 'PHOTO', sourceUrl: args.mediaUrl }
        : undefined;

      const result = await this.service.createLocalPost(args.locationName, {
        summary: args.summary,
        topicType: args.topicType,
        callToAction,
        media,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
