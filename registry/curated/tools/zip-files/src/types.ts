// @ts-nocheck
/**
 * @fileoverview Types for the zip-files extension tool.
 * @module agentos-ext-zip-files/types
 */

/** Input schema for the zip_files tool. */
export interface ZipFilesInput {
  /** Array of absolute file paths to include in the zip. */
  files: string[];
  /** Name for the zip file (without .zip extension). */
  outputName?: string;
}

/** Output schema for the zip_files tool. */
export interface ZipFilesOutput {
  /** Absolute path to the created zip file. */
  path: string;
  /** Zip file name. */
  name: string;
  /** Zip file size in bytes. */
  size: number;
  /** Number of files included. */
  fileCount: number;
}

/** Maximum total input size: 500MB. */
export const MAX_TOTAL_SIZE = 500 * 1024 * 1024;

/** Output directory for zip files. */
export const ZIP_OUTPUT_DIR = '/tmp/wunderland-zips';

/** Auto-cleanup threshold: 1 hour. */
export const CLEANUP_AGE_MS = 60 * 60 * 1000;
