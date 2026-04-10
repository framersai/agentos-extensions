// @ts-nocheck
/**
 * @module WidgetFileManager
 *
 * Manages the local widgets directory for generated HTML widgets. Provides
 * methods to save widget HTML to disk, list existing widgets, delete files,
 * resolve full paths, and construct view/download URLs.
 *
 * Files are stored under `{workspaceDir}/widgets/` with timestamped,
 * slugified filenames to avoid collisions and ensure filesystem safety.
 */

import { mkdir, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Metadata returned when listing files in the widgets directory.
 */
export interface WidgetFileEntry {
  /** The file's base name (e.g. `2026-03-28T12-00-00-000Z-my-widget.html`). */
  filename: string;

  /** File size in bytes. */
  sizeBytes: number;

  /** ISO 8601 timestamp of when the file was created (from filesystem). */
  createdAt: string;
}

/**
 * Result returned after successfully saving a widget to disk.
 */
export interface WidgetSaveResult {
  /** Absolute path to the saved file. */
  filePath: string;

  /** The generated filename (basename only). */
  filename: string;
}

/**
 * Manages the widgets directory for generated HTML widgets. Handles saving,
 * listing, deleting, and resolving paths for widget files.
 *
 * @example
 * ```ts
 * const manager = new WidgetFileManager('/home/agent/workspace', 3777);
 * const { filePath, filename } = await manager.save('<html>...</html>', 'My Chart');
 * const url = manager.getWidgetUrl(filename);
 * ```
 */
export class WidgetFileManager {
  /** Absolute path to the widgets directory. */
  private readonly widgetsDir: string;

  /** Port used for constructing view and download URLs. */
  private readonly serverPort: number;

  /** Optional externally reachable base URL used for generated links. */
  private readonly publicBaseUrl?: string;

  /**
   * Create a new WidgetFileManager instance.
   *
   * @param workspaceDir - Root workspace directory for the agent. The
   *   widgets directory will be created as a subdirectory named `widgets`.
   * @param serverPort - Optional port number for constructing local
   *   view and download URLs. Defaults to `3777`.
   * @param publicBaseUrl - Optional externally reachable base URL used
   *   instead of `localhost`, for example `https://agent.example.com`.
   */
  constructor(workspaceDir: string, serverPort?: number, publicBaseUrl?: string) {
    this.widgetsDir = join(workspaceDir, 'widgets');
    this.serverPort = serverPort ?? 3777;
    this.publicBaseUrl = this.normalizeBaseUrl(publicBaseUrl);
  }

  /**
   * Save an HTML widget to the widgets directory.
   *
   * Creates the widgets directory if it does not already exist. The filename
   * is generated from the current ISO timestamp and a slugified version of
   * the widget title, ensuring uniqueness and filesystem safety.
   *
   * @param html  - The complete HTML content to write.
   * @param title - The widget title, used to derive the filename slug.
   * @returns An object containing the absolute `filePath` and `filename`.
   */
  async save(html: string, title: string): Promise<WidgetSaveResult> {
    if (!existsSync(this.widgetsDir)) {
      await mkdir(this.widgetsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = this.slugify(title);
    const filename = `${timestamp}-${slug}.html`;
    const filePath = join(this.widgetsDir, filename);

    await writeFile(filePath, html, 'utf-8');

    return { filePath, filename };
  }

  /**
   * List all widget files in the widgets directory with their metadata.
   *
   * Returns an empty array if the widgets directory does not exist or
   * contains no files. Non-file entries (directories, symlinks) are
   * silently skipped.
   *
   * @returns An array of {@link WidgetFileEntry} objects sorted by filename
   *   (newest first due to the timestamp prefix convention).
   */
  async list(): Promise<WidgetFileEntry[]> {
    if (!existsSync(this.widgetsDir)) {
      return [];
    }

    const entries = await readdir(this.widgetsDir);
    const results: WidgetFileEntry[] = [];

    for (const entry of entries) {
      const fullPath = join(this.widgetsDir, entry);

      try {
        const fileStat = await stat(fullPath);

        if (!fileStat.isFile()) {
          continue;
        }

        results.push({
          filename: entry,
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
   * Remove a widget file from the widgets directory.
   *
   * @param filename - The basename of the file to delete.
   * @returns `true` if the file was successfully deleted, `false` if it
   *   did not exist or could not be removed.
   */
  async remove(filename: string): Promise<boolean> {
    const fullPath = this.resolveManagedPath(filename);

    if (!fullPath || !existsSync(fullPath)) {
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
   * Resolve a filename to its absolute path in the widgets directory.
   *
   * @param filename - The basename of the file to resolve.
   * @returns The absolute file path if the file exists, or `null` if not found.
   */
  resolve(filename: string): string | null {
    const fullPath = this.resolveManagedPath(filename);
    if (!fullPath) return null;
    return existsSync(fullPath) ? fullPath : null;
  }

  /**
   * Construct a view URL for the given widget filename.
   *
   * Uses the configured server port to build a localhost URL. In
   * production deployments the URL scheme would be replaced by a
   * reverse-proxy or CDN URL.
   *
   * @param filename - The basename of the widget file.
   * @returns A fully-qualified HTTP URL pointing to the widget.
   */
  getWidgetUrl(filename: string): string {
    return this.buildManagedUrl(`/widgets/${encodeURIComponent(filename)}`);
  }

  /**
   * Construct a download URL for the given widget filename.
   *
   * Returns the same URL as {@link getWidgetUrl} since the widget is
   * a self-contained HTML file that can be both viewed and downloaded.
   *
   * @param filename - The basename of the widget file.
   * @returns A fully-qualified HTTP URL pointing to the file.
   */
  getDownloadUrl(filename: string): string {
    return this.buildManagedUrl(`/widgets/${encodeURIComponent(filename)}`);
  }

  private resolveManagedPath(filename: string): string | null {
    const normalized = filename.trim();
    if (
      !normalized ||
      normalized === '.' ||
      normalized === '..' ||
      basename(normalized) !== normalized ||
      normalized.includes('/') ||
      normalized.includes('\\')
    ) {
      return null;
    }
    return join(this.widgetsDir, normalized);
  }

  private normalizeBaseUrl(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    return normalized.replace(/\/+$/, '');
  }

  private buildManagedUrl(pathname: string): string {
    const baseUrl = this.publicBaseUrl ?? `http://localhost:${this.serverPort}`;
    return `${baseUrl}${pathname}`;
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
   * slugify('3D Solar System!') // '3d-solar-system'
   * ```
   */
  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
