/**
 * @fileoverview Shared formatting utilities — ported from core/discord/formatting.py
 */

export const BRAND_COLOR = 0x8b6914;
export const SCAM_COLOR = 0xff0000;
export const EMBED_DESCRIPTION_LIMIT = 4096;
export const EMBED_TITLE_LIMIT = 256;

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function domainFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function faviconUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Split lines into chunks that fit within the description limit.
 * Lines are joined with newlines; chunks are split at line boundaries.
 */
export function splitDescriptionLines(
  lines: string[],
  limit: number = EMBED_DESCRIPTION_LIMIT,
): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const line of lines) {
    const lineLen = line.length + (current.length > 0 ? 1 : 0); // +1 for newline
    if (currentLen + lineLen > limit && current.length > 0) {
      chunks.push(current.join('\n'));
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += lineLen;
  }

  if (current.length > 0) {
    chunks.push(current.join('\n'));
  }

  return chunks;
}

/**
 * Convert large numbers to human-readable format (1.36T, 28.5B, etc.)
 */
export function humanNumber(raw: string): string {
  const cleaned = raw.replace(/[$,]/g, '').trim();
  if (['—', 'N/A', ''].includes(cleaned)) return '—';

  const val = parseFloat(cleaned);
  if (isNaN(val)) return raw;

  const prefix = raw.includes('$') ? '$' : '';
  if (val >= 1_000_000_000_000) return `${prefix}${(val / 1_000_000_000_000).toFixed(2)}T`;
  if (val >= 1_000_000_000) return `${prefix}${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${prefix}${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${prefix}${(val / 1_000).toFixed(1)}K`;
  return `${prefix}${val.toFixed(2)}`;
}
