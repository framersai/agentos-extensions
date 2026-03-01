/**
 * Embed builders for The Founders system.
 * Returns plain embed objects compatible with discord.js EmbedBuilder.
 */

import type { Founder, FounderProject, FounderCheckin } from '../store/FounderStore.js';
import { LEVELS, levelInfo, xpProgressBar, xpToNextLevel } from '../store/xp.js';

const BRAND_COLOR = 0x8b6914;
const EMBED_DESC_LIMIT = 4096;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3).trimEnd() + '...' : s;
}

function levelEmoji(level: number): string {
  return (
    { 1: '\u{1F511}', 2: '\u{1F41B}', 3: '\u{1F63A}', 4: '\u{1F422}', 5: '\u2728' }[
      level
    ] ?? '\u{1F511}'
  );
}

// ── Profile ────────────────────────────────────────────────────────────────

export function profileEmbed(
  founder: Founder,
  projects: FounderProject[],
  avatarUrl?: string | null,
): Record<string, any> {
  const info = levelInfo(founder.level);
  const emoji = levelEmoji(founder.level);
  const title = `${emoji} ${founder.displayName}`;

  const lines: string[] = [];
  if (founder.tagline) lines.push(`*${founder.tagline}*`);
  lines.push('');
  lines.push(`**Level ${founder.level}** \u2014 ${info.name}`);
  const remaining = xpToNextLevel(founder.xp);
  const bar = xpProgressBar(founder.xp);
  lines.push(
    remaining !== null
      ? `\`${bar}\` ${founder.xp} XP (${remaining} to next)`
      : `\`${bar}\` ${founder.xp} XP (MAX)`,
  );

  if (founder.streakDaily || founder.streakWeekly) {
    const parts: string[] = [];
    if (founder.streakDaily) parts.push(`\u{1F525} ${founder.streakDaily}-day streak`);
    if (founder.streakWeekly) parts.push(`\u{1F4C5} ${founder.streakWeekly}-week streak`);
    lines.push(parts.join(' \u2022 '));
  }

  if (founder.skills) lines.push(`\n**Skills:** ${founder.skills}`);
  if (founder.lookingFor) lines.push(`**Looking for:** ${founder.lookingFor}`);
  if (founder.bio) lines.push(`\n${truncate(founder.bio, 500)}`);

  const links: string[] = [];
  if (founder.websiteUrl) links.push(`[\u{1F310} Website](${founder.websiteUrl})`);
  if (founder.githubUrl) links.push(`[\u{1F4BB} GitHub](${founder.githubUrl})`);
  if (founder.twitterUrl) links.push(`[\u{1F426} Twitter](${founder.twitterUrl})`);
  if (founder.linkedinUrl) links.push(`[\u{1F4BC} LinkedIn](${founder.linkedinUrl})`);
  if (links.length) lines.push(links.join(' \u2022 '));

  const embed: Record<string, any> = {
    title,
    description: truncate(lines.join('\n'), EMBED_DESC_LIMIT),
    color: info.color,
    footer: { text: `Founder since ${founder.joinedAt.slice(0, 10)} | Powered by Wunderbots | rabbithole.inc` },
  };

  // Projects as fields.
  const fields: any[] = [];
  for (const proj of projects.slice(0, 3)) {
    const stage = proj.stage ? ` (${proj.stage})` : '';
    const primary = proj.isPrimary ? ' \u2B50' : '';
    const valueParts: string[] = [];
    if (proj.description) valueParts.push(truncate(proj.description, 200));
    if (proj.techStack) valueParts.push(`**Tech:** ${proj.techStack}`);
    fields.push({
      name: `${proj.name}${stage}${primary}`,
      value: valueParts.join('\n') || 'No description',
      inline: false,
    });
  }
  if (fields.length) embed.fields = fields;

  if (avatarUrl) embed.thumbnail = { url: avatarUrl };

  return embed;
}

// ── Project ────────────────────────────────────────────────────────────────

export function projectEmbed(project: FounderProject): Record<string, any> {
  const lines: string[] = [];
  if (project.description) lines.push(project.description);
  lines.push('');
  if (project.stage) lines.push(`**Stage:** ${project.stage}`);
  if (project.techStack) lines.push(`**Tech Stack:** ${project.techStack}`);
  if (project.industry) lines.push(`**Industry:** ${project.industry}`);
  if (project.lookingForRoles) lines.push(`**Looking for:** ${project.lookingForRoles}`);

  const linkParts: string[] = [];
  if (project.websiteUrl) linkParts.push(`[\u{1F310} Website](${project.websiteUrl})`);
  if (project.repoUrl) linkParts.push(`[\u{1F4BB} Repo](${project.repoUrl})`);
  if (linkParts.length) lines.push(linkParts.join(' \u2022 '));

  const primary = project.isPrimary ? ' \u2B50' : '';
  return {
    title: `${project.name}${primary}`,
    description: truncate(lines.join('\n'), EMBED_DESC_LIMIT),
    color: BRAND_COLOR,
    footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
  };
}

// ── Daily Check-in ─────────────────────────────────────────────────────────

export function dailyCheckinEmbed(
  checkin: FounderCheckin,
  founder: Founder,
  avatarUrl?: string | null,
): Record<string, any> {
  const info = levelInfo(founder.level);
  const emoji = levelEmoji(founder.level);

  const lines: string[] = [];
  lines.push(`**What I worked on:**\n${checkin.content}`);
  if (checkin.blockers) lines.push(`\n**Blockers:**\n${checkin.blockers}`);
  if (checkin.feedbackUrl) lines.push(`\n\u{1F517} [Feedback link](${checkin.feedbackUrl})`);

  const streakText = founder.streakDaily > 1 ? ` \u{1F525} ${founder.streakDaily}-day streak` : '';
  const embed: Record<string, any> = {
    title: `${emoji} Daily Standup \u2014 ${founder.displayName}`,
    description: truncate(lines.join('\n'), EMBED_DESC_LIMIT),
    color: info.color,
    footer: { text: `+${checkin.xpEarned} XP${streakText} | ${info.name} (L${founder.level})` },
  };
  if (avatarUrl) embed.thumbnail = { url: avatarUrl };
  return embed;
}

// ── Weekly Check-in ────────────────────────────────────────────────────────

export function weeklyCheckinEmbed(
  checkin: FounderCheckin,
  founder: Founder,
  avatarUrl?: string | null,
): Record<string, any> {
  const info = levelInfo(founder.level);
  const emoji = levelEmoji(founder.level);

  const lines: string[] = [];
  lines.push(`**Milestones:**\n${checkin.content}`);
  if (checkin.milestonesText) lines.push(`\n**Key Achievements:**\n${checkin.milestonesText}`);
  if (checkin.lessons) lines.push(`\n**Lessons Learned:**\n${checkin.lessons}`);
  if (checkin.metrics) lines.push(`\n**Metrics:**\n${checkin.metrics}`);
  if (checkin.feedbackUrl) lines.push(`\n\u{1F517} [Feedback link](${checkin.feedbackUrl})`);

  const streakText = founder.streakWeekly > 1 ? ` \u{1F4C5} ${founder.streakWeekly}-week streak` : '';
  const embed: Record<string, any> = {
    title: `${emoji} Weekly Update \u2014 ${founder.displayName}`,
    description: truncate(lines.join('\n'), EMBED_DESC_LIMIT),
    color: info.color,
    footer: { text: `+${checkin.xpEarned} XP${streakText} | ${info.name} (L${founder.level})` },
  };
  if (avatarUrl) embed.thumbnail = { url: avatarUrl };
  return embed;
}

// ── Leaderboard ────────────────────────────────────────────────────────────

export function leaderboardEmbed(
  founders: Founder[],
  page = 0,
  perPage = 10,
): Record<string, any> {
  const lines: string[] = [];
  for (let i = 0; i < founders.length; i++) {
    const f = founders[i];
    const rank = page * perPage + i + 1;
    const emoji = levelEmoji(f.level);
    const info = levelInfo(f.level);
    const medal: Record<number, string> = { 1: '\u{1F947}', 2: '\u{1F948}', 3: '\u{1F949}' };
    const prefix = medal[rank] ?? `**${rank}.**`;
    const streak = f.streakDaily > 1 ? ` \u{1F525}${f.streakDaily}d` : '';
    lines.push(
      `${prefix} ${emoji} **${f.displayName}** \u2014 ${f.xp} XP (${info.name})${streak}`,
    );
  }

  return {
    title: '\u{1F3C6} Founders Leaderboard',
    description: lines.length
      ? truncate(lines.join('\n'), EMBED_DESC_LIMIT)
      : 'No founders yet.',
    color: BRAND_COLOR,
    footer: { text: `Page ${page + 1} | Powered by Wunderbots | rabbithole.inc` },
  };
}

// ── Level Up ───────────────────────────────────────────────────────────────

export function levelUpEmbed(
  founder: Founder,
  oldLevel: number,
  avatarUrl?: string | null,
): Record<string, any> {
  const newInfo = levelInfo(founder.level);
  const emoji = levelEmoji(founder.level);

  const rewards: Record<number, string> = {
    2: 'Profile highlighted in directory, pin primary project',
    3: 'Project showcase eligibility, cofounder matching priority, +5 /ask quota',
    4: 'Featured in showcase, +10 /ask quota',
    5: 'Mentor status, unlimited /ask quota',
  };
  const rewardText = rewards[founder.level] ?? '';

  const lines = [
    `<@${founder.userId}> leveled up!`,
    '',
    `**${levelInfo(oldLevel).name}** \u2192 **${newInfo.name}** ${emoji}`,
    `Total XP: ${founder.xp}`,
  ];
  if (rewardText) lines.push(`\n**Unlocked:** ${rewardText}`);

  const embed: Record<string, any> = {
    title: `${emoji} Level Up!`,
    description: lines.join('\n'),
    color: newInfo.color,
    footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
  };
  if (avatarUrl) embed.thumbnail = { url: avatarUrl };
  return embed;
}

// ── Welcome Program ────────────────────────────────────────────────────────

export function welcomeProgramEmbed(): Record<string, any> {
  const lines = [
    '**The Founders** is a gamified build-in-public program for builders, makers, and entrepreneurs.',
    '*Available to Explorer subscribers and above.*',
    '',
    '**How it works:**',
    '\u{1F407} Join and create your founder profile',
    '\u{1F4CB} Daily standups & weekly updates earn XP',
    '\u{1F4AC} Give feedback with `/feedback @user` to earn XP',
    '\u{1F3AF} Record milestones for big XP boosts',
    '\u{1F3C6} Showcase your project monthly',
    '\u{1F91D} Find your technical cofounder',
    '',
    '**Levels:**',
  ];
  for (const lvl of LEVELS) {
    const emoji = levelEmoji(lvl.level);
    lines.push(`${emoji} **L${lvl.level} ${lvl.name}** \u2014 ${lvl.xp} XP`);
  }
  lines.push('', '**Click the button below to join!**');

  return {
    title: '\u{1F407} The Founders \u2014 Build in Public, Level Up, Ship',
    description: lines.join('\n'),
    color: BRAND_COLOR,
    footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
  };
}

// ── Founder Joined ─────────────────────────────────────────────────────────

export function founderJoinedEmbed(
  founder: Founder,
  projectName: string,
  projectDesc: string | null,
  avatarUrl?: string | null,
  displayName?: string | null,
): Record<string, any> {
  const emoji = levelEmoji(1);
  const name = displayName || `<@${founder.userId}>`;
  const embed: Record<string, any> = {
    title: '\u{1F389} New Founder Joined!',
    description: `**${name}** joined The Founders as a ${emoji} Founder - Curious Alice!`,
    color: BRAND_COLOR,
    fields: [{ name: 'Project', value: projectName, inline: true }],
    footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
  };
  if (projectDesc) embed.fields.push({ name: 'Building', value: truncate(projectDesc, 200), inline: false });
  if (founder.skills) embed.fields.push({ name: 'Skills', value: founder.skills, inline: true });
  if (avatarUrl) embed.thumbnail = { url: avatarUrl };
  return embed;
}

// ── Directory ──────────────────────────────────────────────────────────────

export function directoryEmbed(
  founders: Founder[],
  page = 0,
  perPage = 5,
  total = 0,
  skillFilter?: string | null,
): Record<string, any> {
  let title = '\u{1F4D6} Founders Directory';
  if (skillFilter) title += ` \u2014 "${skillFilter}"`;

  const fields: any[] = [];
  for (const f of founders) {
    const emoji = levelEmoji(f.level);
    const info = levelInfo(f.level);
    const valueParts: string[] = [];
    if (f.tagline) valueParts.push(`*${f.tagline}*`);
    valueParts.push(`${info.name} (L${f.level}) \u2022 ${f.xp} XP`);
    if (f.skills) valueParts.push(`**Skills:** ${truncate(f.skills, 150)}`);
    if (f.lookingFor) valueParts.push(`**Looking for:** ${truncate(f.lookingFor, 100)}`);
    if (f.optInMatching) valueParts.push('\u{1F91D} Open to cofounder matching');
    fields.push({
      name: `${emoji} ${f.displayName}`,
      value: valueParts.join('\n'),
      inline: false,
    });
  }

  const embed: Record<string, any> = {
    title,
    color: BRAND_COLOR,
    footer: { text: `Page ${page + 1} \u2022 ${total} total founders | Powered by Wunderbots | rabbithole.inc` },
  };
  if (fields.length) embed.fields = fields;
  else embed.description = 'No founders found.';
  return embed;
}

// ── Feedback ───────────────────────────────────────────────────────────────

export function feedbackEmbed(
  giverUserId: string,
  receiverUserId: string,
  text: string,
  link: string | null,
  xp: number,
): Record<string, any> {
  const embed: Record<string, any> = {
    title: '\u{1F4AC} Feedback',
    description: truncate(text, EMBED_DESC_LIMIT - 200),
    color: BRAND_COLOR,
    fields: [
      { name: 'From', value: `<@${giverUserId}>`, inline: true },
      { name: 'To', value: `<@${receiverUserId}>`, inline: true },
    ],
    footer: { text: `+${xp} XP | Powered by Wunderbots | rabbithole.inc` },
  };
  if (link) embed.fields.push({ name: 'Link', value: truncate(link, 300), inline: false });
  return embed;
}

// ── Milestone ──────────────────────────────────────────────────────────────

export function milestoneEmbed(
  userId: string,
  title: string,
  milestoneType: string,
  description: string | null,
  xp: number,
  avatarUrl?: string | null,
): Record<string, any> {
  const embed: Record<string, any> = {
    title: `\u{1F3AF} Milestone: ${title}`,
    description: `<@${userId}> hit a milestone!\n\n**Type:** ${milestoneType}\n${description ?? ''}`,
    color: BRAND_COLOR,
    footer: { text: `+${xp} XP | Powered by Wunderbots | rabbithole.inc` },
  };
  if (avatarUrl) embed.thumbnail = { url: avatarUrl };
  return embed;
}
