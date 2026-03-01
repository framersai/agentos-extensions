/**
 * @fileoverview News embed formatter — supports both single articles and
 * multi-source topic clusters.
 */

import type { DiscordEmbed, NewsArticle, NewsCluster, NewsItem } from '../types.js';
import { BRAND_COLOR, truncate, nowIso, domainFromUrl, faviconUrl, EMBED_DESCRIPTION_LIMIT } from './common.js';

const CATEGORY_EMOJI: Record<string, string> = {
  us: '🇺🇸',
  world: '🌍',
  tech: '💻',
  finance: '💰',
  science: '🔬',
  media: '🎬',
};

const CATEGORY_LABEL: Record<string, string> = {
  us: 'US',
  world: 'World',
  tech: 'Tech',
  finance: 'Finance',
  science: 'Science',
  media: 'Media',
};

/**
 * Format news items (single articles + clusters) into Discord embeds.
 */
export function formatNewsEmbeds(articles: NewsItem[], category: string): DiscordEmbed[] {
  const emoji = CATEGORY_EMOJI[category] ?? '📰';
  const label = CATEGORY_LABEL[category] ?? category;
  const embeds: DiscordEmbed[] = [];

  for (const item of articles) {
    if ((item as NewsCluster).type === 'cluster') {
      const embed = formatClusterEmbed(item as NewsCluster, emoji, label);
      if (embed) embeds.push(embed);
    } else {
      const embed = formatSingleEmbed(item as NewsArticle, emoji, label);
      if (embed) embeds.push(embed);
    }
  }

  return embeds;
}

function formatSingleEmbed(article: NewsArticle, emoji: string, label: string): DiscordEmbed | null {
  if (!article.title) return null;

  const url = article.url?.startsWith('http') ? article.url : undefined;
  const source = url ? domainFromUrl(url) : '';
  const summary = article.summary || 'No summary available.';

  const embed: DiscordEmbed = {
    title: truncate(article.title.trim(), 250),
    description: truncate(summary, EMBED_DESCRIPTION_LIMIT),
    color: BRAND_COLOR,
    timestamp: nowIso(),
    author: { name: `${emoji} Wunderland News — ${label}` },
    footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
  };

  if (url) embed.url = url;

  const fields: DiscordEmbed['fields'] = [];
  if (source) fields.push({ name: 'Source', value: truncate(source, 256), inline: true });
  if (article.date) fields.push({ name: 'Published', value: truncate(article.date, 256), inline: true });
  if (fields.length > 0) embed.fields = fields;

  if (source) {
    embed.thumbnail = { url: faviconUrl(source) };
  }

  if (article.image_url?.startsWith('https://') && !article.image_url.includes(' ')) {
    embed.image = { url: article.image_url };
  }

  return embed;
}

function formatClusterEmbed(cluster: NewsCluster, emoji: string, label: string): DiscordEmbed | null {
  if (!cluster.title || !cluster.sources?.length) return null;

  const sourceLines = cluster.sources.map((s, i) => {
    const linkText = truncate(s.title || s.domain, 60);
    const link = s.url ? `[${linkText}](${s.url})` : linkText;
    return `${i + 1}. ${link} — *${s.domain}*`;
  });

  const summaryText = cluster.summary || 'Multiple sources covering this story.';
  const sourcesBlock = `\n\n**Sources:**\n${sourceLines.join('\n')}`;
  const description = truncate(summaryText + sourcesBlock, EMBED_DESCRIPTION_LIMIT);

  const embed: DiscordEmbed = {
    title: truncate(cluster.title, 250),
    description,
    color: BRAND_COLOR,
    timestamp: nowIso(),
    author: { name: `${emoji} Wunderland News — ${label}` },
    footer: { text: `${cluster.sources.length} sources | Powered by Wunderbots | rabbithole.inc` },
  };

  if (cluster.sources[0]?.url) {
    embed.url = cluster.sources[0].url;
  }

  if (cluster.sources[0]?.domain) {
    embed.thumbnail = { url: faviconUrl(cluster.sources[0].domain) };
  }

  if (cluster.image_url?.startsWith('https://') && !cluster.image_url.includes(' ')) {
    embed.image = { url: cluster.image_url };
  }

  return embed;
}
