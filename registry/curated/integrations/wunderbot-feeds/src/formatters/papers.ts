/**
 * @fileoverview AI papers embed formatter — ported from wunderbot_news.py _post_paper
 */

import type { DiscordEmbed, Paper } from '../types.js';
import { BRAND_COLOR, truncate, nowIso, EMBED_DESCRIPTION_LIMIT, EMBED_TITLE_LIMIT } from './common.js';

const ARXIV_CATEGORY_LABELS: Record<string, string> = {
  arxiv_cs_ai: 'Artificial Intelligence',
  arxiv_cs_lg: 'Machine Learning',
  arxiv_cs_cl: 'NLP / Language Models',
  arxiv_stat_ml: 'Statistical ML',
};

function parseArxivId(value: string): string | null {
  if (!value) return null;
  // Try full URL first
  const urlMatch = value.match(/(?:arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5})(?:v\d+)?/);
  if (urlMatch) return urlMatch[1];
  // Try bare ID
  const idMatch = value.match(/\b(\d{4}\.\d{4,5})(?:v\d+)?\b/);
  if (idMatch) return idMatch[1];
  return null;
}

function pdfUrlForArxiv(absUrl: string): string | null {
  const arxivId = parseArxivId(absUrl);
  if (!arxivId) return null;
  return `https://arxiv.org/pdf/${arxivId}.pdf`;
}

function formatAbstractPreview(abstract: string, maxLen = 600): string {
  // Strip arXiv RSS metadata prefix
  let text = abstract.trim();
  text = text.replace(/^arXiv:\d{4}\.\d{4,5}(?:v\d+)?\s+Announce\s+Type:\s*\w+\s*(?:Abstract:\s*)?/i, '');
  text = text.replace(/^Announce\s+Type:\s*\w+\s*(?:Abstract:\s*)?/i, '');
  text = text.trim();

  if (!text) return '';
  if (text.length <= maxLen) return text;

  const cut = text.slice(0, maxLen);
  const lastPeriod = cut.lastIndexOf('. ');
  if (lastPeriod > maxLen / 2) {
    return cut.slice(0, lastPeriod + 1);
  }
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '\u2026';
}

/**
 * Format papers into individual embeds (one per paper).
 *
 * Uses the LLM-generated digest (TL;DR + Key Contributions + Why It Matters)
 * from the Python API when available, falling back to abstract preview.
 */
export function formatPaperEmbeds(papers: Paper[]): DiscordEmbed[] {
  const embeds: DiscordEmbed[] = [];

  for (const paper of papers) {
    if (!paper.title) continue;

    // Prefer LLM digest; fall back to abstract preview
    let description: string;
    if (paper.digest && paper.digest.trim().length > 30) {
      description = paper.digest.trim();
    } else if (paper.abstract) {
      description = formatAbstractPreview(paper.abstract);
    } else {
      description = 'No abstract available.';
    }

    const embed: DiscordEmbed = {
      title: truncate(paper.title.trim(), EMBED_TITLE_LIMIT),
      description: truncate(description, EMBED_DESCRIPTION_LIMIT),
      color: BRAND_COLOR,
      timestamp: nowIso(),
      author: { name: '\u{1f4c4} AI Papers' },
      footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
    };

    if (paper.url) embed.url = paper.url;

    const fields: DiscordEmbed['fields'] = [];

    const categoryLabel = ARXIV_CATEGORY_LABELS[paper.source] ?? paper.source;
    if (categoryLabel) {
      fields.push({ name: 'Category', value: categoryLabel, inline: true });
    }

    const arxivId = paper.arxiv_id || parseArxivId(paper.url || '');
    if (arxivId) {
      fields.push({ name: 'arXiv', value: `\`${arxivId}\``, inline: true });
    }

    // Links field
    const linkParts: string[] = [];
    if (paper.url) linkParts.push(`[Abstract](${paper.url})`);
    const pdf = paper.url ? pdfUrlForArxiv(paper.url) : null;
    if (pdf) linkParts.push(`[PDF](${pdf})`);
    if (linkParts.length > 0) {
      fields.push({ name: 'Links', value: linkParts.join(' \u00b7 '), inline: true });
    }

    if (fields.length > 0) embed.fields = fields;

    embeds.push(embed);
  }

  return embeds;
}
