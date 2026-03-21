/**
 * @fileoverview YC Jobs embed formatter — one embed per job listing.
 */

import type { DiscordEmbed, YCJobListing } from '../types.js';
import { BRAND_COLOR, truncate, nowIso, EMBED_DESCRIPTION_LIMIT } from './common.js';

/** Green accent for remote jobs to make them visually pop. */
const REMOTE_COLOR = 0x2ecc71;

/**
 * Format a single YC job listing as a Discord embed.
 * Each job gets its own embed (unlike LinkedIn which batches).
 * Remote jobs get a green accent color and prominent badge.
 */
export function formatYCJobEmbed(job: YCJobListing): DiscordEmbed {
  const isRemote = job.is_remote || /\bremote\b/i.test(job.location || '');
  const lines: string[] = [];

  // Remote banner (prominent, top of embed)
  if (isRemote) {
    lines.push('> \u{1F30D} **REMOTE** \u2014 Work from anywhere');
    lines.push('');
  }

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
  if (job.location && !isRemote) {
    locParts.push(`\u{1F4CD} ${job.location}`);
  } else if (job.location && isRemote) {
    // Show location as optional/HQ if remote
    locParts.push(`\u{1F4CD} ${job.location} (HQ)`);
  }
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

  // Title with remote badge
  const remoteBadge = isRemote ? ' \u{1F30D}' : '';
  const titleText = job.title
    ? `\u{1F4BC} ${truncate(job.title, 190)}${remoteBadge}`
    : `\u{1F4BC} Job Opening${remoteBadge}`;

  let footerText = 'Powered by Wunderbots | rabbithole.inc';
  if (job.source_type === 'external_regex' && job.confidence < 0.5) {
    footerText = '\u2139\ufe0f Limited info (external listing) | ' + footerText;
  }

  const embed: DiscordEmbed = {
    title: titleText,
    description: truncate(lines.join('\n'), EMBED_DESCRIPTION_LIMIT),
    color: isRemote ? REMOTE_COLOR : BRAND_COLOR,
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
