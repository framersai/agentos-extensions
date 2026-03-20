/**
 * @fileoverview YC Jobs embed formatter — one embed per job listing.
 */

import type { DiscordEmbed, YCJobListing } from '../types.js';
import { BRAND_COLOR, truncate, nowIso, EMBED_DESCRIPTION_LIMIT } from './common.js';

/**
 * Format a single YC job listing as a Discord embed.
 * Each job gets its own embed (unlike LinkedIn which batches).
 */
export function formatYCJobEmbed(job: YCJobListing): DiscordEmbed {
  const lines: string[] = [];

  // Company line
  const batchTag = job.yc_batch ? ` (YC ${job.yc_batch})` : '';
  const tagline = job.company_tagline ? ` \u2014 ${job.company_tagline}` : '';
  if (job.company) {
    lines.push(`**${job.company}**${batchTag}${tagline}`);
    lines.push('');
  }

  // Compensation
  const compParts: string[] = [];
  if (job.salary) compParts.push(`\u{1F4B0} ${job.salary}`);
  if (job.equity) compParts.push(`\u{1F4CA} ${job.equity}`);
  if (compParts.length > 0) lines.push(compParts.join(' \u00b7 '));

  // Location + job type
  const locParts: string[] = [];
  if (job.location) locParts.push(`\u{1F4CD} ${job.location}`);
  if (job.is_remote) locParts.push('\u{1F3E0} Remote');
  if (job.job_type) locParts.push(`\u{1F3E2} ${job.job_type}`);
  if (locParts.length > 0) lines.push(locParts.join(' \u00b7 '));

  // Experience + visa
  const expParts: string[] = [];
  if (job.experience) expParts.push(`\u{1F464} ${job.experience}`);
  if (job.visa) expParts.push(`\u{1F6C2} ${job.visa}`);
  if (expParts.length > 0) lines.push(expParts.join(' \u00b7 '));

  // Description
  if (job.description) {
    lines.push('');
    lines.push(truncate(job.description, 500));
  }

  // Apply link
  if (job.apply_url || job.url) {
    lines.push('');
    const applyUrl = job.apply_url || job.url;
    lines.push(`[Apply \u2192](${applyUrl})`);
  }

  const titleText = job.title
    ? `\u{1F4BC} ${truncate(job.title, 200)}`
    : '\u{1F4BC} Job Opening';

  let footerText = 'Powered by Wunderbots | rabbithole.inc';
  if (job.source_type === 'external_regex' && job.confidence < 0.5) {
    footerText = '\u2139\ufe0f Limited info (external listing) | ' + footerText;
  }

  const embed: DiscordEmbed = {
    title: titleText,
    description: truncate(lines.join('\n'), EMBED_DESCRIPTION_LIMIT),
    color: BRAND_COLOR,
    timestamp: nowIso(),
    footer: { text: footerText },
  };

  if (job.logo_url) {
    embed.thumbnail = { url: job.logo_url };
  }

  if (job.url) {
    embed.url = job.url;
  }

  return embed;
}
