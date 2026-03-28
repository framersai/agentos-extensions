import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ExportFileManager } from '../src/delivery/ExportFileManager.js';

describe('ExportFileManager', () => {
  let tempDir: string;
  let manager: ExportFileManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'export-file-manager-'));
    manager = new ExportFileManager(tempDir, 3777);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('rejects traversal attempts for resolve() and remove()', async () => {
    expect(manager.resolve('../secret.pdf')).toBeNull();
    await expect(manager.remove('../secret.pdf')).resolves.toBe(false);
  });

  it('encodes generated URLs safely', () => {
    const downloadUrl = manager.getDownloadUrl('Quarterly Report.pdf');
    const previewUrl = manager.getPreviewUrl('Quarterly Report.pdf');

    expect(downloadUrl).toBe('http://localhost:3777/exports/Quarterly%20Report.pdf');
    expect(previewUrl).toBe(
      'http://localhost:3777/exports/Quarterly%20Report.pdf/preview',
    );
  });
});
