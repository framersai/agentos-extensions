// @ts-nocheck
/**
 * @fileoverview Extension pack factory for the zip-files tool.
 * @module agentos-ext-zip-files
 */

import { ZipFilesTool } from './ZipFilesTool.js';

export { ZipFilesTool } from './ZipFilesTool.js';
export type { ZipFilesInput, ZipFilesOutput } from './types.js';

/** Create the zip-files extension pack. */
export function createExtensionPack() {
  const tool = new ZipFilesTool();
  return {
    name: '@framers/agentos-ext-zip-files',
    version: '0.1.0',
    descriptors: [{ id: 'zip_files', kind: 'tool' as const, priority: 50, payload: tool }],
  };
}
