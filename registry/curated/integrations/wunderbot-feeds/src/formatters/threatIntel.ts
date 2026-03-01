/**
 * @fileoverview Threat intelligence embed formatter — ported from
 * core/news_scraper/sources/threat_intelligence/formatting.py
 */

import type { DiscordEmbed, ThreatIntelArticle } from '../types.js';
import { BRAND_COLOR, truncate, nowIso, domainFromUrl, faviconUrl, EMBED_DESCRIPTION_LIMIT, EMBED_TITLE_LIMIT } from './common.js';

const FIELD_VALUE_LIMIT = 1024;

/**
 * Format threat intel articles into individual embeds (one per article).
 */
export function formatThreatIntelEmbeds(articles: ThreatIntelArticle[]): DiscordEmbed[] {
  const embeds: DiscordEmbed[] = [];

  for (const article of articles) {
    if (!article.title) continue;

    const summary = article.summary || 'No summary available.';
    const embed: DiscordEmbed = {
      title: truncate(article.title.trim(), EMBED_TITLE_LIMIT),
      description: truncate(summary, EMBED_DESCRIPTION_LIMIT),
      color: article.color ?? BRAND_COLOR,
      timestamp: nowIso(),
      author: { name: '\u{1f6e1}\ufe0f Wunderland Threat Intel' },
      footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
    };

    if (article.url) embed.url = article.url;

    // Source favicon as thumbnail
    const domain = article.url ? domainFromUrl(article.url) : '';
    if (domain) {
      embed.thumbnail = { url: faviconUrl(domain) };
    }

    const fields: DiscordEmbed['fields'] = [];
    if (article.source) {
      fields.push({ name: 'Source', value: truncate(article.source, FIELD_VALUE_LIMIT), inline: true });
    }
    if (article.date) {
      fields.push({ name: 'Published', value: truncate(article.date, FIELD_VALUE_LIMIT), inline: true });
    }

    // Pass through any additional fields from the API
    if (article.fields) {
      for (const f of article.fields) {
        fields.push({ name: f.name, value: truncate(f.value, FIELD_VALUE_LIMIT), inline: f.inline });
      }
    }

    if (fields.length > 0) embed.fields = fields;

    embeds.push(embed);
  }

  return embeds;
}
