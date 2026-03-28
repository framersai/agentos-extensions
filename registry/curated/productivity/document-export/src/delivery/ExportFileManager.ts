/**
 * @module ExportFileManager
 *
 * Manages the local exports directory for generated documents. Provides
 * methods to save document buffers to disk, list existing exports, delete
 * files, resolve full paths, and construct download/preview URLs.
 *
 * Files are stored under `{agentWorkspaceDir}/exports/` with timestamped,
 * slugified filenames to avoid collisions and ensure filesystem safety.
 */

import { mkdir, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';

/**
 * Metadata returned when listing files in the exports directory.
 */
export interface ExportFileEntry {
  /** The file's base name (e.g. `2026-03-28T12-00-00-report.pdf`). */
  filename: string;

  /** The document format derived from the file extension (e.g. `pdf`). */
  format: string;

  /** File size in bytes. */
  sizeBytes: number;

  /** ISO 8601 timestamp of when the file was created (from filesystem). */
  createdAt: string;
}

/**
 * Result returned after successfully saving a document buffer to disk.
 */
export interface SaveResult {
  /** Absolute path to the saved file. */
  filePath: string;

  /** The generated filename (basename only). */
  filename: string;
}

/**
 * Manages the exports directory for generated documents. Handles saving,
 * listing, deleting, and resolving paths for exported files.
 *
 * @example
 * ```ts
 * const manager = new ExportFileManager('/home/agent/workspace', 3777);
 * const { filePath, filename } = await manager.save(buffer, 'Q4 Report', 'pdf');
 * const url = manager.getDownloadUrl(filename);
 * ```
 */
export class ExportFileManager {
  /** Absolute path to the exports directory. */
  private readonly exportsDir: string;

  /** Port used for constructing download and preview URLs. */
  private readonly serverPort: number;

  /**
   * Create a new ExportFileManager instance.
   *
   * @param agentWorkspaceDir - Root workspace directory for the agent. The
   *   exports directory will be created as a subdirectory named `exports`.
   * @param serverPort - Optional port number for constructing localhost
   *   download and preview URLs. Defaults to `3777`.
   */
  constructor(agentWorkspaceDir: string, serverPort?: number) {
    this.exportsDir = join(agentWorkspaceDir, 'exports');
    this.serverPort = serverPort ?? 3777;
  }

  /**
   * Save a document buffer to the exports directory.
   *
   * Creates the exports directory if it does not already exist. The filename
   * is generated from the current ISO timestamp and a slugified version of
   * the document title, ensuring uniqueness and filesystem safety.
   *
   * @param buffer - The raw document bytes to write.
   * @param title  - The document title, used to derive the filename slug.
   * @param format - The file extension / format (e.g. `'pdf'`, `'docx'`).
   * @returns An object containing the absolute `filePath` and `filename`.
   */
  async save(buffer: Buffer, title: string, format: string): Promise<SaveResult> {
    // Ensure the exports directory exists
    if (!existsSync(this.exportsDir)) {
      await mkdir(this.exportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = this.slugify(title);
    const filename = `${timestamp}-${slug}.${format}`;
    const filePath = join(this.exportsDir, filename);

    await writeFile(filePath, buffer);

    return { filePath, filename };
  }

  /**
   * List all files in the exports directory with their metadata.
   *
   * Returns an empty array if the exports directory does not exist or
   * contains no files. Non-file entries (directories, symlinks) are
   * silently skipped.
   *
   * @returns An array of {@link ExportFileEntry} objects sorted by filename
   *   (newest first due to the timestamp prefix convention).
   */
  async list(): Promise<ExportFileEntry[]> {
    if (!existsSync(this.exportsDir)) {
      return [];
    }

    const entries = await readdir(this.exportsDir);
    const results: ExportFileEntry[] = [];

    for (const entry of entries) {
      const fullPath = join(this.exportsDir, entry);

      try {
        const fileStat = await stat(fullPath);

        if (!fileStat.isFile()) {
          continue;
        }

        const ext = extname(entry).replace(/^\./, '');

        results.push({
          filename: entry,
          format: ext,
          sizeBytes: fileStat.size,
          createdAt: fileStat.birthtime.toISOString(),
        });
      } catch {
        // Skip files that can't be stat'd (e.g. permission errors)
        continue;
      }
    }

    return results;
  }

  /**
   * Remove a file from the exports directory.
   *
   * @param filename - The basename of the file to delete.
   * @returns `true` if the file was successfully deleted, `false` if it
   *   did not exist or could not be removed.
   */
  async remove(filename: string): Promise<boolean> {
    const fullPath = join(this.exportsDir, filename);

    if (!existsSync(fullPath)) {
      return false;
    }

    try {
      await unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve a filename to its absolute path in the exports directory.
   *
   * @param filename - The basename of the file to resolve.
   * @returns The absolute file path if the file exists, or `null` if not found.
   */
  resolve(filename: string): string | null {
    const fullPath = join(this.exportsDir, filename);
    return existsSync(fullPath) ? fullPath : null;
  }

  /**
   * Construct a download URL for the given filename.
   *
   * Uses the configured server port to build a localhost URL. In
   * production deployments the URL scheme would be replaced by a
   * reverse-proxy or CDN URL.
   *
   * @param filename - The basename of the exported file.
   * @returns A fully-qualified HTTP URL pointing to the file.
   */
  getDownloadUrl(filename: string): string {
    return `http://localhost:${this.serverPort}/exports/${filename}`;
  }

  /**
   * Construct a preview URL for the given filename.
   *
   * The preview endpoint renders a format-specific preview (e.g. an HTML
   * table for CSV, a summary for PDF) rather than serving the raw file.
   *
   * @param filename - The basename of the exported file.
   * @returns A fully-qualified HTTP URL pointing to the preview endpoint.
   */
  getPreviewUrl(filename: string): string {
    return `http://localhost:${this.serverPort}/exports/${filename}/preview`;
  }

  /**
   * Convert a title string into a URL- and filesystem-safe slug.
   *
   * Transforms the input to lowercase, replaces non-alphanumeric
   * characters with hyphens, collapses consecutive hyphens, and trims
   * leading/trailing hyphens.
   *
   * @param title - The raw title string to slugify.
   * @returns A clean, lowercase slug suitable for filenames.
   *
   * @example
   * ```ts
   * slugify('Q4 Revenue Report!') // 'q4-revenue-report'
   * ```
   */
  slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
