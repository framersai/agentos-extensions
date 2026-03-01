/**
 * @fileoverview Jobs embed formatter — ported from bots/jobs_poster.py
 */

import type { DiscordEmbed, JobListing } from '../types.js';
import { BRAND_COLOR, truncate, nowIso, splitDescriptionLines, EMBED_DESCRIPTION_LIMIT, EMBED_TITLE_LIMIT } from './common.js';

/**
 * Format job listings into embed(s). Multiple embeds are returned if the
 * description exceeds the Discord embed limit.
 */
export function formatJobEmbeds(jobs: JobListing[], searchTitle = 'Jobs'): DiscordEmbed[] {
  if (!jobs.length) return [];

  // Sort newest first
  const sorted = [...jobs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const single = sorted.length === 1;

  const lines: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const job = sorted[i];
    if (!job.title) continue;

    const roleClean = truncate(job.title.trim(), 150);
    const prefix = single ? '' : `**${i + 1}.** `;

    let line: string;
    if (job.url) {
      line = `${prefix}[${roleClean}](${job.url}) \u2014 **${job.company}**`;
    } else {
      line = `${prefix}${roleClean} \u2014 **${job.company}**`;
    }

    // Location / salary / remote metadata
    const meta: string[] = [];
    if (job.location && job.location !== 'N/A') {
      meta.push(`\u{1f4cd} ${job.location}`);
    }
    if (job.salary && job.salary !== 'N/A') {
      meta.push(`\u{1f4b0} ${job.salary}`);
    }
    if (job.is_remote) {
      meta.push('\u{1f3e0} Remote');
    }
    if (meta.length > 0) {
      line += '\n\u2003' + meta.join(' \u00b7 ');
    }

    // Summary
    if (job.summary) {
      line += '\n\u2003' + truncate(job.summary, 220);
    }

    lines.push(line);
  }

  if (!lines.length) return [];

  const title = `\u{1f4bc} ${searchTitle} \u2014 ${lines.length} new`;
  const chunks = splitDescriptionLines(lines, EMBED_DESCRIPTION_LIMIT);

  return chunks.map((chunk, idx) => {
    const embed: DiscordEmbed = {
      description: chunk,
      color: BRAND_COLOR,
      timestamp: nowIso(),
      footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
    };
    if (idx === 0) {
      embed.title = truncate(title, EMBED_TITLE_LIMIT);
      embed.author = { name: 'Wunderland Jobs' };
    }
    return embed;
  });
}
