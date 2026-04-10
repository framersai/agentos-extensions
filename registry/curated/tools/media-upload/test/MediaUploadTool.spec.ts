// @ts-nocheck
/**
 * @fileoverview Unit tests for MediaUploadTool.
 *
 * Tests cover: tool metadata, file existence validation, file size checks,
 * MIME type detection, unsupported extension rejection, asset ID generation,
 * directory path rejection, and error handling.
 *
 * The fs/promises, path, and crypto modules are mocked via vi.mock to
 * avoid touching the real filesystem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaUploadTool, type MediaUploadInput } from '../src/MediaUploadTool.js';

/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */

const { mockAccess, mockStat, mockReadFile } = vi.hoisted(() => {
  const mockAccess = vi.fn();
  const mockStat = vi.fn();
  const mockReadFile = vi.fn();
  return { mockAccess, mockStat, mockReadFile };
});

vi.mock('fs/promises', () => ({
  default: {
    access: (...args: any[]) => mockAccess(...args),
    stat: (...args: any[]) => mockStat(...args),
    readFile: (...args: any[]) => mockReadFile(...args),
  },
  access: (...args: any[]) => mockAccess(...args),
  stat: (...args: any[]) => mockStat(...args),
  readFile: (...args: any[]) => mockReadFile(...args),
}));

vi.mock('path', () => ({
  default: {
    resolve: (p: string) => (p.startsWith('/') ? p : `/cwd/${p}`),
    extname: (p: string) => {
      const dot = p.lastIndexOf('.');
      return dot >= 0 ? p.substring(dot) : '';
    },
    basename: (p: string) => p.split('/').pop() ?? p,
  },
  resolve: (p: string) => (p.startsWith('/') ? p : `/cwd/${p}`),
  extname: (p: string) => {
    const dot = p.lastIndexOf('.');
    return dot >= 0 ? p.substring(dot) : '';
  },
  basename: (p: string) => p.split('/').pop() ?? p,
}));

vi.mock('crypto', () => ({
  default: {
    randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  },
  randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function setupValidFile(ext: string, sizeBytes: number) {
  mockAccess.mockResolvedValue(undefined);
  mockStat.mockResolvedValue({ isFile: () => true, size: sizeBytes });
  mockReadFile.mockResolvedValue(Buffer.alloc(sizeBytes));
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('MediaUploadTool', () => {
  let tool: MediaUploadTool;

  beforeEach(() => {
    tool = new MediaUploadTool();
    vi.clearAllMocks();
  });

  /* ── Metadata ─────────────────────────────────────────────────── */

  describe('metadata', () => {
    it('should expose the correct id and name', () => {
      expect(tool.id).toBe('mediaUpload');
      expect(tool.name).toBe('mediaUpload');
    });

    it('should require filePath in the input schema', () => {
      expect(tool.inputSchema.required).toEqual(['filePath']);
    });

    it('should flag hasSideEffects as true', () => {
      expect(tool.hasSideEffects).toBe(true);
    });

    it('should include a description mentioning supported formats', () => {
      expect(tool.description).toContain('JPEG');
      expect(tool.description).toContain('MP4');
    });
  });

  /* ── File existence validation ────────────────────────────────── */

  describe('file existence', () => {
    it('should return error when file does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await tool.execute({ filePath: '/missing/file.jpg' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
      expect(result.error).toContain('/missing/file.jpg');
    });

    it('should resolve relative paths before checking existence', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await tool.execute({ filePath: 'relative/photo.png' });

      expect(result.success).toBe(false);
      // The error should contain the resolved absolute path
      expect(result.error).toContain('/cwd/relative/photo.png');
    });
  });

  /* ── Directory rejection ──────────────────────────────────────── */

  describe('directory rejection', () => {
    it('should return error when path points to a directory', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStat.mockResolvedValue({ isFile: () => false, size: 4096 });

      const result = await tool.execute({ filePath: '/some/directory.jpg' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a file');
    });
  });

  /* ── File size checks ─────────────────────────────────────────── */

  describe('file size validation', () => {
    it('should reject files larger than 100 MB', async () => {
      const oversized = 101 * 1024 * 1024; // 101 MB
      setupValidFile('.jpg', oversized);

      const result = await tool.execute({ filePath: '/big/photo.jpg' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('File too large');
      expect(result.error).toContain('100 MB limit');
    });

    it('should accept files exactly at the 100 MB limit', async () => {
      const exactLimit = 100 * 1024 * 1024;
      setupValidFile('.jpg', exactLimit);

      const result = await tool.execute({ filePath: '/exact/photo.jpg' });

      expect(result.success).toBe(true);
    });

    it('should accept small files', async () => {
      setupValidFile('.png', 1024);

      const result = await tool.execute({ filePath: '/small/icon.png' });

      expect(result.success).toBe(true);
      expect(result.data!.size).toBe(1024);
    });
  });

  /* ── MIME type detection ──────────────────────────────────────── */

  describe('MIME type detection', () => {
    const cases: Array<[string, string]> = [
      ['.jpg', 'image/jpeg'],
      ['.jpeg', 'image/jpeg'],
      ['.png', 'image/png'],
      ['.gif', 'image/gif'],
      ['.webp', 'image/webp'],
      ['.svg', 'image/svg+xml'],
      ['.mp4', 'video/mp4'],
      ['.mov', 'video/quicktime'],
      ['.webm', 'video/webm'],
      ['.mp3', 'audio/mpeg'],
      ['.wav', 'audio/wav'],
      ['.ogg', 'audio/ogg'],
      ['.pdf', 'application/pdf'],
    ];

    for (const [ext, expectedMime] of cases) {
      it(`should detect ${ext} as ${expectedMime}`, async () => {
        setupValidFile(ext, 2048);

        const result = await tool.execute({ filePath: `/test/file${ext}` });

        expect(result.success).toBe(true);
        expect(result.data!.mimeType).toBe(expectedMime);
      });
    }
  });

  /* ── Unsupported extension rejection ──────────────────────────── */

  describe('unsupported file types', () => {
    it('should reject .exe files', async () => {
      setupValidFile('.exe', 2048);

      const result = await tool.execute({ filePath: '/test/malware.exe' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file type');
      expect(result.error).toContain('.exe');
    });

    it('should reject .zip files', async () => {
      setupValidFile('.zip', 2048);

      const result = await tool.execute({ filePath: '/test/archive.zip' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });

    it('should list supported extensions in the error message', async () => {
      setupValidFile('.txt', 2048);

      const result = await tool.execute({ filePath: '/test/readme.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('.jpg');
      expect(result.error).toContain('.mp4');
      expect(result.error).toContain('.mp3');
      expect(result.error).toContain('.pdf');
    });
  });

  /* ── Asset ID generation ──────────────────────────────────────── */

  describe('asset ID and output', () => {
    it('should return a UUID asset ID', async () => {
      setupValidFile('.png', 4096);

      const result = await tool.execute({ filePath: '/test/image.png' });

      expect(result.success).toBe(true);
      expect(result.data!.assetId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    });

    it('should return the original filename', async () => {
      setupValidFile('.jpg', 4096);

      const result = await tool.execute({ filePath: '/path/to/my-photo.jpg' });

      expect(result.data!.filename).toBe('my-photo.jpg');
    });

    it('should include a human-readable message', async () => {
      setupValidFile('.mp4', 10240);

      const result = await tool.execute({ filePath: '/videos/clip.mp4' });

      expect(result.data!.message).toContain('clip.mp4');
      expect(result.data!.message).toContain('video/mp4');
      expect(result.data!.message).toContain('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    });

    it('should categorize images correctly in the message', async () => {
      setupValidFile('.png', 2048);

      const result = await tool.execute({ filePath: '/test/icon.png' });

      expect(result.data!.message).toContain('image uploaded');
    });

    it('should categorize video correctly in the message', async () => {
      setupValidFile('.webm', 2048);

      const result = await tool.execute({ filePath: '/test/clip.webm' });

      expect(result.data!.message).toContain('video uploaded');
    });

    it('should categorize audio correctly in the message', async () => {
      setupValidFile('.mp3', 2048);

      const result = await tool.execute({ filePath: '/test/song.mp3' });

      expect(result.data!.message).toContain('audio uploaded');
    });
  });

  /* ── Tags ─────────────────────────────────────────────────────── */

  describe('tags', () => {
    it('should pass through provided tags', async () => {
      setupValidFile('.jpg', 2048);

      const result = await tool.execute({
        filePath: '/test/photo.jpg',
        tags: ['profile', 'avatar'],
      });

      expect(result.data!.tags).toEqual(['profile', 'avatar']);
    });

    it('should default to empty tags when none provided', async () => {
      setupValidFile('.jpg', 2048);

      const result = await tool.execute({ filePath: '/test/photo.jpg' });

      expect(result.data!.tags).toEqual([]);
    });
  });

  /* ── Error handling ───────────────────────────────────────────── */

  describe('error handling', () => {
    it('should catch unexpected errors and return them gracefully', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStat.mockRejectedValue(new Error('Permission denied'));

      const result = await tool.execute({ filePath: '/protected/file.jpg' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('should handle non-Error thrown values', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockStat.mockRejectedValue('raw string error');

      const result = await tool.execute({ filePath: '/test/file.jpg' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('raw string error');
    });
  });
});
