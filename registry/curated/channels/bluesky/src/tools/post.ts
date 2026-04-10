// @ts-nocheck
/**
 * @fileoverview BlueskyPostTool — create a post on Bluesky with text, optional images, and language tags.
 *
 * Rich-text facets (mentions, links, hashtags) are detected automatically via the AT Protocol RichText API.
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { BlueskyService } from '../BlueskyService.js';

/** Infer MIME type from file extension. */
function inferMimeType(filePath: string): string {
  const ext = basename(filePath).split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    default: return 'image/jpeg';
  }
}

export class BlueskyPostTool {
  readonly id = 'blueskyPost';
  readonly name = 'blueskyPost';
  readonly displayName = 'Create Post';
  readonly description = 'Create a Bluesky post with text, optional images (up to 4), and language tags. Mentions, links, and hashtags are detected automatically.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Post text (max 300 graphemes). Mentions (@handle), links, and #hashtags are auto-detected.' },
      imagePaths: { type: 'array', items: { type: 'string' }, description: 'File paths to images to attach (max 4)' },
      langs: { type: 'array', items: { type: 'string' }, description: 'Language tags (e.g. ["en", "ja"])' },
    },
    required: ['text'],
  };

  constructor(private service: BlueskyService) {}

  async execute(args: { text: string; imagePaths?: string[]; langs?: string[] }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const images: Array<{ data: Uint8Array; mimeType: string }> = [];
      if (args.imagePaths?.length) {
        for (const filePath of args.imagePaths.slice(0, 4)) {
          const buffer = await readFile(filePath);
          images.push({
            data: new Uint8Array(buffer),
            mimeType: inferMimeType(filePath),
          });
        }
      }

      const result = await this.service.createPost(args.text, {
        images: images.length ? images : undefined,
        langs: args.langs,
      });

      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
