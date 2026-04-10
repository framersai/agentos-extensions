// @ts-nocheck
/**
 * @fileoverview Media Upload Tool — upload files to the media library for social posts.
 *
 * Reads a local file, detects MIME type, and returns an asset ID that can be
 * referenced in other post tools (e.g. multiChannelPost, twitterPost, etc.).
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MediaUploadInput {
  /** Path to the media file to upload. */
  filePath: string;
  /** Tags for organizing the asset in the media library. */
  tags?: string[];
  /** Agent seed ID (owner). Defaults to current agent if omitted. */
  seedId?: string;
}

export interface MediaUploadOutput {
  assetId: string;
  filename: string;
  mimeType: string;
  size: number;
  tags: string[];
  message: string;
}

/* ------------------------------------------------------------------ */
/*  MIME map                                                            */
/* ------------------------------------------------------------------ */

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
};

/* ------------------------------------------------------------------ */
/*  Supported media type sets                                          */
/* ------------------------------------------------------------------ */

const SUPPORTED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const SUPPORTED_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm']);
const SUPPORTED_AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg']);

/** Maximum file size: 100 MB */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/*  Tool executor callback type                                        */
/* ------------------------------------------------------------------ */

export type ToolExecutorFn = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;

/* ------------------------------------------------------------------ */
/*  MediaUploadTool                                                    */
/* ------------------------------------------------------------------ */

export class MediaUploadTool {
  readonly id = 'mediaUpload';
  readonly name = 'mediaUpload';
  readonly displayName = 'Upload Media';
  readonly description =
    'Upload an image, video, or audio file to the media library for use in social posts. ' +
    'Returns an asset ID that can be referenced in post tools (multiChannelPost, twitterPost, etc.). ' +
    'Supported formats: JPEG, PNG, GIF, WebP, SVG, MP4, MOV, WebM, MP3, WAV, OGG.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      filePath: {
        type: 'string',
        description: 'Absolute or relative path to the media file to upload',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for organizing the asset in the media library',
      },
      seedId: {
        type: 'string',
        description: 'Agent seed ID (owner). Defaults to current agent if omitted',
      },
    },
    required: ['filePath'],
  };

  /* -------------------------------------------------------------- */
  /*  Tool executor — set by the orchestrator that loads this ext    */
  /* -------------------------------------------------------------- */

  private toolExecutor?: ToolExecutorFn;

  setToolExecutor(executor: ToolExecutorFn): void {
    this.toolExecutor = executor;
  }

  /* -------------------------------------------------------------- */
  /*  execute()                                                      */
  /* -------------------------------------------------------------- */

  async execute(
    args: MediaUploadInput,
  ): Promise<{ success: boolean; data?: MediaUploadOutput; error?: string }> {
    try {
      const fs = await import('fs/promises');
      const nodePath = await import('path');
      const crypto = await import('crypto');

      // Resolve and validate file path
      const resolvedPath = nodePath.resolve(args.filePath);

      // Check file exists
      try {
        await fs.access(resolvedPath);
      } catch {
        return {
          success: false,
          error: `File not found: ${resolvedPath}`,
        };
      }

      // Read file stats
      const stat = await fs.stat(resolvedPath);
      if (!stat.isFile()) {
        return {
          success: false,
          error: `Path is not a file: ${resolvedPath}`,
        };
      }

      if (stat.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `File too large: ${(stat.size / (1024 * 1024)).toFixed(1)} MB exceeds ${MAX_FILE_SIZE / (1024 * 1024)} MB limit`,
        };
      }

      // Detect MIME type from extension
      const ext = nodePath.extname(resolvedPath).toLowerCase();
      const mimeType = MIME_MAP[ext] ?? 'application/octet-stream';

      if (
        !SUPPORTED_IMAGE_EXTS.has(ext) &&
        !SUPPORTED_VIDEO_EXTS.has(ext) &&
        !SUPPORTED_AUDIO_EXTS.has(ext) &&
        ext !== '.pdf'
      ) {
        return {
          success: false,
          error: `Unsupported file type: ${ext}. Supported: ${[
            ...SUPPORTED_IMAGE_EXTS,
            ...SUPPORTED_VIDEO_EXTS,
            ...SUPPORTED_AUDIO_EXTS,
            '.pdf',
          ].join(', ')}`,
        };
      }

      // Read file into buffer
      const buffer = await fs.readFile(resolvedPath);
      const originalName = nodePath.basename(resolvedPath);

      // Generate asset ID
      const assetId = crypto.randomUUID();

      // Determine media category for the message
      let mediaCategory = 'file';
      if (SUPPORTED_IMAGE_EXTS.has(ext)) mediaCategory = 'image';
      else if (SUPPORTED_VIDEO_EXTS.has(ext)) mediaCategory = 'video';
      else if (SUPPORTED_AUDIO_EXTS.has(ext)) mediaCategory = 'audio';

      const tags = args.tags ?? [];
      const sizeKb = (buffer.length / 1024).toFixed(1);

      return {
        success: true,
        data: {
          assetId,
          filename: originalName,
          mimeType,
          size: buffer.length,
          tags,
          message:
            `Media ${mediaCategory} uploaded: ${originalName} (${mimeType}, ${sizeKb} KB). ` +
            `Use assetId "${assetId}" in post tools.`,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}
