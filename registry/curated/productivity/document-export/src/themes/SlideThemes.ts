/**
 * @module SlideThemes
 *
 * Predefined slide themes for PPTX generation and visual styling across all
 * document formats. Each theme provides a cohesive set of colours, fonts,
 * and a chart palette so that generated presentations look polished without
 * any manual design work.
 *
 * Five built-in themes are included:
 *
 * - **dark** — Deep navy background with bright cyan accent
 * - **light** — Clean white background with blue accent (default)
 * - **corporate** — Neutral grey with Bootstrap-blue accent
 * - **creative** — Warm amber tones with gold accent
 * - **minimal** — Pure white with subdued grey accents
 *
 * @example
 * ```ts
 * import { getTheme, SLIDE_THEMES } from '../themes/SlideThemes.js';
 *
 * const theme = getTheme('dark');
 * console.log(theme.background); // '#1a1a2e'
 *
 * const all = Object.keys(SLIDE_THEMES); // ['dark', 'light', 'corporate', 'creative', 'minimal']
 * ```
 */

import type { SlideTheme } from '../types.js';

// ---------------------------------------------------------------------------
// Theme definitions
// ---------------------------------------------------------------------------

/**
 * All available slide themes, keyed by their short name.
 *
 * Consumers should prefer {@link getTheme} for safe lookup with a fallback
 * to the default theme when an unrecognised name is provided.
 */
export const SLIDE_THEMES: Record<string, SlideTheme> = {
  /**
   * Deep navy background with light text and bright cyan highlights.
   * Ideal for conference talks and large-screen presentations.
   */
  dark: {
    name: 'dark',
    background: '#1a1a2e',
    textColor: '#e0e0e0',
    titleColor: '#ffffff',
    mutedColor: '#9e9e9e',
    accentColor: '#00d4ff',
    titleFont: 'Helvetica Neue',
    bodyFont: 'Helvetica Neue',
    chartPalette: [
      '#00d4ff',
      '#ff6b6b',
      '#feca57',
      '#48dbfb',
      '#ff9ff3',
      '#54a0ff',
    ],
  },

  /**
   * Classic white background with dark text and a rich blue accent.
   * The default theme for general-purpose documents.
   */
  light: {
    name: 'light',
    background: '#ffffff',
    textColor: '#333333',
    titleColor: '#111111',
    mutedColor: '#888888',
    accentColor: '#2563eb',
    titleFont: 'Helvetica Neue',
    bodyFont: 'Helvetica Neue',
    chartPalette: [
      '#2563eb',
      '#dc2626',
      '#16a34a',
      '#ca8a04',
      '#9333ea',
      '#0891b2',
    ],
  },

  /**
   * Neutral light-grey background with Bootstrap-aligned blue accent.
   * Designed for business reports, quarterly reviews, and internal decks.
   */
  corporate: {
    name: 'corporate',
    background: '#f8f9fa',
    textColor: '#212529',
    titleColor: '#1a1a1a',
    mutedColor: '#6c757d',
    accentColor: '#0d6efd',
    titleFont: 'Arial',
    bodyFont: 'Arial',
    chartPalette: [
      '#0d6efd',
      '#198754',
      '#ffc107',
      '#dc3545',
      '#0dcaf0',
      '#6f42c1',
    ],
  },

  /**
   * Warm amber background with gold accent and serif titles.
   * Suited for creative pitches, workshops, and storytelling decks.
   */
  creative: {
    name: 'creative',
    background: '#fef3c7',
    textColor: '#1f2937',
    titleColor: '#111827',
    mutedColor: '#6b7280',
    accentColor: '#f59e0b',
    titleFont: 'Georgia',
    bodyFont: 'Helvetica Neue',
    chartPalette: [
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#10b981',
      '#f97316',
      '#ec4899',
    ],
  },

  /**
   * Pure white background with monochrome grey tones.
   * Emphasises content with generous whitespace and zero visual noise.
   */
  minimal: {
    name: 'minimal',
    background: '#ffffff',
    textColor: '#374151',
    titleColor: '#000000',
    mutedColor: '#9ca3af',
    accentColor: '#6b7280',
    titleFont: 'Helvetica',
    bodyFont: 'Helvetica',
    chartPalette: [
      '#6b7280',
      '#374151',
      '#9ca3af',
      '#1f2937',
      '#d1d5db',
      '#4b5563',
    ],
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** The default theme used when no theme name is specified. */
export const DEFAULT_THEME: SlideTheme = SLIDE_THEMES['light'];

/**
 * Retrieve a slide theme by name. Returns the named theme if it exists,
 * otherwise falls back to the `'light'` default theme.
 *
 * @param name - Optional theme identifier (e.g. `'dark'`, `'corporate'`).
 *               When `undefined` or unrecognised the default `'light'` theme
 *               is returned.
 * @returns The resolved {@link SlideTheme} instance.
 *
 * @example
 * ```ts
 * const theme = getTheme('corporate');
 * console.log(theme.accentColor); // '#0d6efd'
 *
 * const fallback = getTheme('nonexistent');
 * console.log(fallback.name); // 'light'
 * ```
 */
export function getTheme(name?: string): SlideTheme {
  if (name && name in SLIDE_THEMES) {
    return SLIDE_THEMES[name];
  }

  return DEFAULT_THEME;
}
