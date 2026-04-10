// @ts-nocheck
import type { MastodonService } from '../MastodonService.js';

export class MastodonPostTool {
  readonly id = 'mastodonPost';
  readonly name = 'mastodonPost';
  readonly displayName = 'Post Status';
  readonly description = 'Post a status (toot) to Mastodon with text, optional content warning, visibility level, and media.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Status text (max 500 characters on most instances)' },
      spoilerText: { type: 'string', description: 'Content warning / spoiler text' },
      visibility: {
        type: 'string',
        enum: ['public', 'unlisted', 'private', 'direct'],
        description: 'Post visibility (default: public)',
      },
      mediaPath: { type: 'string', description: 'Path to media file to attach' },
      sensitive: { type: 'boolean', description: 'Mark media as sensitive' },
      language: { type: 'string', description: 'ISO 639-1 language code (e.g. "en")' },
    },
    required: ['text'],
  };

  constructor(private service: MastodonService) {}

  async execute(args: {
    text: string;
    spoilerText?: string;
    visibility?: 'public' | 'unlisted' | 'private' | 'direct';
    mediaPath?: string;
    sensitive?: boolean;
    language?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const mediaIds: string[] = [];
      if (args.mediaPath) {
        const id = await this.service.uploadMedia(args.mediaPath);
        mediaIds.push(id);
      }
      const result = await this.service.postStatus({
        text: args.text,
        spoilerText: args.spoilerText,
        visibility: args.visibility,
        mediaIds: mediaIds.length ? mediaIds : undefined,
        sensitive: args.sensitive,
        language: args.language,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
