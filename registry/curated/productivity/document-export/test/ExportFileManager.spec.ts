// @ts-nocheck
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

  it('uses the configured public base URL for generated export links', () => {
    const remoteManager = new ExportFileManager(tempDir, 3777, 'https://agent.example.com/base/');

    expect(remoteManager.getDownloadUrl('Quarterly Report.pdf')).toBe(
      'https://agent.example.com/base/exports/Quarterly%20Report.pdf',
    );
    expect(remoteManager.getPreviewUrl('Quarterly Report.pdf')).toBe(
      'https://agent.example.com/base/exports/Quarterly%20Report.pdf/preview',
    );
  });

  it('rejects invalid export formats when saving files', async () => {
    await expect(
      manager.save(Buffer.from('test'), 'Quarterly Report', '../pdf'),
    ).rejects.toThrow('Invalid export format');
  });
});
