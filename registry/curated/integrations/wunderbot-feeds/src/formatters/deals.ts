/**
 * @fileoverview Udemy deals formatter — ported from bots/deals_poster.py
 */

import type { DiscordEmbed, UdemyDeal } from '../types.js';
import { BRAND_COLOR, truncate, nowIso, splitDescriptionLines, EMBED_DESCRIPTION_LIMIT, EMBED_TITLE_LIMIT } from './common.js';

// Keyword → emoji mapping for course topics
const TOPIC_EMOJIS: Array<[string[], string]> = [
  [['python'], '🐍'],
  [['javascript', 'js ', 'node', 'react', 'angular', 'vue', 'typescript'], '🟨'],
  [['java ', 'spring', 'kotlin'], '☕'],
  [['c++', 'c programming', 'c language'], '⚙️'],
  [['rust'], '🦀'],
  [['go ', 'golang'], '🐹'],
  [['swift', 'ios ', 'iphone'], '🍎'],
  [['android'], '📱'],
  [['flutter', 'dart'], '💠'],
  [['sql', 'database', 'mysql', 'postgres', 'mongodb'], '🗄️'],
  [['aws', 'amazon web', 'cloud', 'azure', 'gcp', 'devops', 'docker', 'kubernetes'], '☁️'],
  [['machine learning', 'deep learning', 'neural', 'ai ', 'artificial intelligence', 'nlp', 'llm'], '🤖'],
  [['data science', 'data analy', 'pandas', 'numpy', 'statistics'], '📊'],
  [['cyber', 'security', 'hacking', 'penetration', 'ethical hack', 'infosec'], '🛡️'],
  [['blockchain', 'crypto', 'solidity', 'web3', 'ethereum', 'smart contract'], '⛓️'],
  [['game', 'unity', 'unreal', 'godot'], '🎮'],
  [['design', 'figma', 'ui ', 'ux ', 'photoshop', 'illustrator', 'graphic'], '🎨'],
  [['video', 'premiere', 'after effects', 'animation', 'motion'], '🎬'],
  [['music', 'audio', 'sound'], '🎵'],
  [['photo', 'lightroom', 'camera'], '📷'],
  [['excel', 'spreadsheet', 'google sheets', 'power bi', 'tableau'], '📈'],
  [['marketing', 'seo', 'social media', 'ads ', 'advertising', 'copywriting'], '📣'],
  [['business', 'entrepreneur', 'startup', 'management', 'mba', 'leadership'], '💼'],
  [['finance', 'accounting', 'trading', 'invest', 'stock'], '💰'],
  [['web ', 'html', 'css', 'frontend', 'front-end', 'website', 'wordpress'], '🌐'],
  [['api ', 'rest ', 'backend', 'back-end', 'server'], '🔗'],
  [['linux', 'bash', 'command line', 'terminal', 'shell'], '🐧'],
  [['git ', 'github'], '🔀'],
  [['testing', 'qa ', 'selenium', 'automation'], '🧪'],
  [['math', 'calculus', 'algebra', 'geometry'], '📐'],
  [['english', 'language', 'writing', 'grammar', 'ielts', 'toefl'], '✍️'],
  [['drawing', 'sketch', 'paint', 'art '], '🖌️'],
  [['health', 'fitness', 'yoga', 'meditation', 'wellness'], '🧘'],
  [['cooking', 'food', 'recipe', 'nutrition'], '🍳'],
  [['project management', 'agile', 'scrum', 'jira'], '📋'],
  [['network', 'cisco', 'ccna', 'comptia'], '📡'],
];

function emojiForTitle(title: string): string {
  const lower = title.toLowerCase();
  for (const [keywords, emoji] of TOPIC_EMOJIS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return emoji;
    }
  }
  return '📖';
}

/**
 * Format Udemy deals into embeds (may split across multiple if too long).
 */
export function formatDealsEmbeds(deals: UdemyDeal[]): DiscordEmbed[] {
  const single = deals.length === 1;
  const lines: string[] = [];

  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];
    if (!deal.title) continue;

    const titleClean = truncate(deal.title.trim(), 200);
    const emoji = emojiForTitle(titleClean);
    const prefix = single ? `${emoji} ` : `${emoji} **${i + 1}.** `;
    const link = deal.enroll_url || deal.link;

    let line = link ? `${prefix}[${titleClean}](${link})` : `${prefix}${titleClean}`;
    if (deal.coupon) {
      line += `\n\u2003\u2003Code: \`${deal.coupon}\``;
    }
    lines.push(line);
  }

  if (lines.length === 0) return [];

  // Double-space between entries
  const spaced: string[] = [];
  for (const line of lines) {
    if (spaced.length > 0) spaced.push('');
    spaced.push(line);
  }

  const chunks = splitDescriptionLines(spaced, EMBED_DESCRIPTION_LIMIT);
  return chunks.map((chunk, idx) => {
    const embed: DiscordEmbed = {
      description: chunk,
      color: BRAND_COLOR,
      timestamp: nowIso(),
      footer: { text: `${lines.length} courses • Powered by Wunderbots | rabbithole.inc` },
    };
    if (idx === 0) {
      embed.title = truncate(`🎓 Free Udemy Courses — ${lines.length} new`, EMBED_TITLE_LIMIT);
      embed.author = { name: '🎓 Wunderland Deals' };
    }
    return embed;
  });
}
