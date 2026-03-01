/**
 * Founders interaction handler — processes slash commands, modals, buttons, and autocomplete.
 */

import {
  type Interaction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type ButtonInteraction,
  type AutocompleteInteraction,
  type TextChannel,
  type GuildMember,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type TextInputModalData,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbed,
} from 'discord.js';

import type { FounderStore } from '../store/FounderStore.js';
import {
  LEVEL_ROLE_NAMES,
  XP_DAILY_CHECKIN,
  XP_FEEDBACK_GIVEN,
  XP_SHOWCASE_POST,
  XP_WEEKLY_UPDATE,
  levelInfo,
  xpToNextLevel,
} from '../store/xp.js';
import {
  dailyCheckinEmbed,
  directoryEmbed,
  feedbackEmbed,
  founderJoinedEmbed,
  leaderboardEmbed,
  levelUpEmbed,
  milestoneEmbed,
  profileEmbed,
  projectEmbed,
  weeklyCheckinEmbed,
  welcomeProgramEmbed,
} from '../embeds/index.js';

// ── Config ─────────────────────────────────────────────────────────────────

export interface FoundersHandlerConfig {
  store: FounderStore;
  guildId: string;
  /** Channel IDs for posting announcements. */
  channels?: {
    welcome?: string;
    daily?: string;
    weekly?: string;
    showcase?: string;
    feedback?: string;
    chat?: string;
    milestones?: string;
    cofounder?: string;
  };
  /** Role names for tier gating. */
  proRoles?: Set<string>;
  /** Role name for the base "Founder" role. */
  founderRoleName?: string;
  /** Timezone for day_key calculation (e.g., 'America/Los_Angeles'). */
  timezone?: string;
}

function todayIso(tz?: string): string {
  const now = new Date();
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      return parts; // en-CA gives YYYY-MM-DD
    } catch {
      // fallback
    }
  }
  return now.toISOString().slice(0, 10);
}

function avatarUrl(member: GuildMember | null | undefined): string | null {
  return member?.user?.displayAvatarURL({ size: 128 }) ?? null;
}

function embedToApi(obj: Record<string, any>): APIEmbed {
  return obj as APIEmbed;
}

// ── Founders Command Names (for routing) ───────────────────────────────────

const FOUNDERS_COMMANDS = new Set([
  'join_founders',
  'profile',
  'profile_edit',
  'project_add',
  'project_edit',
  'project_primary',
  'projects',
  'daily',
  'weekly',
  'feedback',
  'milestone',
  'leaderboard',
  'founders',
  'cofounder_opt_in',
  'cofounder_opt_out',
  'cofounder_search',
  'showcase',
]);

const FOUNDERS_MODAL_PREFIX = 'founders:modal:';
const FOUNDERS_BUTTON_PREFIX = 'founders:';

// ── Handler Factory ────────────────────────────────────────────────────────

export function createFoundersHandler(config: FoundersHandlerConfig) {
  const { store, channels, timezone } = config;
  const proRoles = config.proRoles ?? new Set(['Explorer', 'Pioneer', 'Team', 'Enterprise']);
  const founderRoleName = config.founderRoleName ?? 'Founder';

  function hasProRole(member: GuildMember): boolean {
    return member.roles.cache.some((r) => proRoles.has(r.name));
  }

  async function swapLevelRoles(member: GuildMember, newLevel: number): Promise<void> {
    const guild = member.guild;
    const newRoleName = levelInfo(newLevel).name;

    // Remove old level roles.
    for (const roleName of LEVEL_ROLE_NAMES) {
      const role = guild.roles.cache.find((r) => r.name === roleName);
      if (role && member.roles.cache.has(role.id) && roleName !== newRoleName) {
        try { await member.roles.remove(role, 'Founder level change'); } catch { /* */ }
      }
    }

    // Add new level role.
    const newRole = guild.roles.cache.find((r) => r.name === newRoleName);
    if (newRole && !member.roles.cache.has(newRole.id)) {
      try { await member.roles.add(newRole, 'Founder level-up'); } catch { /* */ }
    }

    // Ensure base Founder role.
    const fRole = guild.roles.cache.find((r) => r.name === founderRoleName);
    if (fRole && !member.roles.cache.has(fRole.id)) {
      try { await member.roles.add(fRole, 'Founder join'); } catch { /* */ }
    }
  }

  async function handleLevelUp(
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
    userId: string,
    oldLevel: number,
  ): Promise<void> {
    const founder = store.getFounder(userId);
    if (!founder) return;
    const member = interaction.guild?.members.cache.get(userId) ?? null;
    if (member) await swapLevelRoles(member, founder.level);

    // Post announcement to founder-chat.
    if (channels?.chat && interaction.guild) {
      const ch = interaction.guild.channels.cache.get(channels.chat);
      if (ch?.isTextBased()) {
        try {
          await (ch as TextChannel).send({
            embeds: [embedToApi(levelUpEmbed(founder, oldLevel, avatarUrl(member)))],
          });
        } catch { /* */ }
      }
    }
  }

  async function resolveChannel(
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
    key: keyof NonNullable<FoundersHandlerConfig['channels']>,
  ): Promise<TextChannel | null> {
    const id = channels?.[key];
    if (!id || !interaction.guild) return null;
    const ch = interaction.guild.channels.cache.get(id);
    return ch?.isTextBased() ? (ch as TextChannel) : null;
  }

  // ── Command Handlers ───────────────────────────────────────────────────

  async function handleJoinFounders(i: ChatInputCommandInteraction): Promise<void> {
    if (!i.guild || !(i.member instanceof Object)) {
      await i.reply({ content: 'This command must be used in a server.', ephemeral: true });
      return;
    }
    const member = i.member as GuildMember;
    if (!hasProRole(member)) {
      await i.reply({
        content:
          'The Founders is available to **Explorer** subscribers and above.\nUpgrade at **rabbithole.inc** or use `/verify <email>` if you already have a subscription.',
        ephemeral: true,
      });
      return;
    }
    if (store.getFounder(i.user.id)) {
      await i.reply({ content: "You're already a Founder!", ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`${FOUNDERS_MODAL_PREFIX}join`)
      .setTitle('Join The Founders')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('project_name')
            .setLabel('Project Name')
            .setPlaceholder("What's your project called?")
            .setMaxLength(100)
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('project_description')
            .setLabel('What are you building?')
            .setPlaceholder('Describe your project in a few sentences...')
            .setMaxLength(500)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('skills')
            .setLabel('Your skills')
            .setPlaceholder('Python, React, ML, Design...')
            .setMaxLength(200)
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('looking_for')
            .setLabel('What help do you need?')
            .setPlaceholder('Frontend dev, designer, marketing...')
            .setMaxLength(200)
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
      );
    await i.showModal(modal);
  }

  async function handleJoinModal(i: ModalSubmitInteraction): Promise<void> {
    const projectName = i.fields.getTextInputValue('project_name');
    const projectDescription = i.fields.getTextInputValue('project_description');
    const skills = i.fields.getTextInputValue('skills');
    const lookingFor = i.fields.getTextInputValue('looking_for') || null;

    const displayName = (i.member as GuildMember)?.displayName ?? i.user.displayName ?? i.user.username;
    const founder = store.createFounder(i.user.id, displayName, skills, lookingFor);
    store.createProject(i.user.id, {
      name: projectName,
      description: projectDescription,
      stage: 'idea',
      isPrimary: true,
    });

    // Assign Founder role.
    const member = i.member as GuildMember | null;
    if (member && i.guild) {
      const role = i.guild.roles.cache.find((r) => r.name === founderRoleName);
      if (role) {
        try { await member.roles.add(role, 'Joined The Founders'); } catch { /* */ }
      }
    }

    await i.reply({
      content:
        "Welcome to The Founders! \u{1F511} You're now a Founder - Curious Alice (Level 1).\nUse `/daily` for check-ins, `/weekly` for updates, and `/profile` to see your card.",
      ephemeral: true,
    });

    // DM welcome.
    try {
      await i.user.send(
        'Welcome to **The Founders**! \u{1F511}\n\n' +
        "You're now a **Founder - Curious Alice** (Level 1). Here's how to get started:\n\n" +
        '\u{1F4CB} Use `/daily` in #daily-standups for daily progress check-ins (+10 XP)\n' +
        '\u{1F4CA} Use `/weekly` in #weekly-updates for weekly reports (+50 XP)\n' +
        '\u{1F4AC} Give feedback in #feedback-exchange with `/feedback @user` (+15 XP each)\n' +
        '\u{1F3AF} Record milestones with `/milestone` (+50-300 XP)\n' +
        '\u{1F3C6} Showcase your project once per month (+25 XP)\n\n' +
        'Want to add more details to your profile? Use `/profile_edit` to add:\n' +
        '- A tagline and bio\n' +
        '- Website, GitHub, Twitter, LinkedIn links\n' +
        '- More detailed skills\n\n' +
        'Ready to find a cofounder? Use `/cofounder_opt_in` to appear in search results.\n\n' +
        'Build in public. Level up. Ship. \u{1F680}',
      );
    } catch { /* DMs might be disabled */ }

    // Announce in #founder-chat.
    const ch = await resolveChannel(i as any, 'chat');
    if (ch) {
      try {
        await ch.send({
          embeds: [embedToApi(founderJoinedEmbed(founder, projectName, projectDescription, avatarUrl(member), member?.displayName))],
        });
      } catch { /* */ }
    }
  }

  async function handleProfile(i: ChatInputCommandInteraction): Promise<void> {
    const target = i.options.getUser('user') ?? i.user;
    const founder = store.getFounder(target.id);
    if (!founder) {
      const who = target.id === i.user.id ? 'You are' : `${target.displayName} is`;
      await i.reply({ content: `${who} not a Founder yet. Use /join_founders to join!`, ephemeral: true });
      return;
    }
    const projects = store.getProjects(target.id);
    const member = i.guild?.members.cache.get(target.id) ?? null;
    await i.reply({
      embeds: [embedToApi(profileEmbed(founder, projects, avatarUrl(member)))],
      ephemeral: true,
    });
  }

  async function handleProfileEdit(i: ChatInputCommandInteraction): Promise<void> {
    const founder = store.getFounder(i.user.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder yet. Use /join_founders first.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`${FOUNDERS_MODAL_PREFIX}profile_edit`)
      .setTitle('Edit Profile')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('tagline')
            .setLabel('Tagline')
            .setPlaceholder('Building the future of X...')
            .setMaxLength(100)
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(founder.tagline ?? ''),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('skills')
            .setLabel('Skills')
            .setPlaceholder('Python, React, ML, Design...')
            .setMaxLength(200)
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(founder.skills ?? ''),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('looking_for')
            .setLabel('Looking for')
            .setPlaceholder('Frontend dev, designer, marketer...')
            .setMaxLength(200)
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(founder.lookingFor ?? ''),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('bio')
            .setLabel('Bio')
            .setPlaceholder('What are you building? What should people know about you?')
            .setMaxLength(500)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(founder.bio ?? ''),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('links')
            .setLabel('Links (one per line)')
            .setPlaceholder('website: https://...\ngithub: https://...\ntwitter: https://...\nlinkedin: https://...')
            .setMaxLength(600)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(
              [
                founder.websiteUrl ? `website: ${founder.websiteUrl}` : '',
                founder.githubUrl ? `github: ${founder.githubUrl}` : '',
                founder.twitterUrl ? `twitter: ${founder.twitterUrl}` : '',
                founder.linkedinUrl ? `linkedin: ${founder.linkedinUrl}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            ),
        ),
      );
    await i.showModal(modal);
  }

  async function handleProfileEditModal(i: ModalSubmitInteraction): Promise<void> {
    const tagline = i.fields.getTextInputValue('tagline') || null;
    const skills = i.fields.getTextInputValue('skills') || null;
    const lookingFor = i.fields.getTextInputValue('looking_for') || null;
    const bio = i.fields.getTextInputValue('bio') || null;

    let websiteUrl: string | null = null;
    let githubUrl: string | null = null;
    let twitterUrl: string | null = null;
    let linkedinUrl: string | null = null;
    const linksRaw = i.fields.getTextInputValue('links') || '';
    for (const line of linksRaw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.includes(':')) continue;
      const [key, ...rest] = trimmed.split(':');
      const val = rest.join(':').trim();
      switch (key.trim().toLowerCase()) {
        case 'website': websiteUrl = val || null; break;
        case 'github': githubUrl = val || null; break;
        case 'twitter': twitterUrl = val || null; break;
        case 'linkedin': linkedinUrl = val || null; break;
      }
    }

    store.updateFounderProfile(i.user.id, {
      tagline,
      skills,
      lookingFor,
      bio,
      websiteUrl,
      githubUrl,
      twitterUrl,
      linkedinUrl,
    });
    await i.reply({ content: 'Profile updated!', ephemeral: true });
  }

  async function handleProjectAdd(i: ChatInputCommandInteraction): Promise<void> {
    const founder = store.getFounder(i.user.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder yet. Use /join_founders first.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`${FOUNDERS_MODAL_PREFIX}project_add`)
      .setTitle('Add Project')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Project name').setMaxLength(100).setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Description').setPlaceholder('What does it do? Who is it for?').setMaxLength(500).setStyle(TextInputStyle.Paragraph).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('stage').setLabel('Stage').setPlaceholder('idea / mvp / launched / scaling').setMaxLength(20).setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('tech_stack').setLabel('Tech stack').setPlaceholder('Python, React, PostgreSQL...').setMaxLength(200).setStyle(TextInputStyle.Short).setRequired(false),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('extra').setLabel('Extra (optional)').setPlaceholder('industry: fintech\nwebsite: https://...\nrepo: https://...\nlooking_for: designer').setMaxLength(600).setStyle(TextInputStyle.Paragraph).setRequired(false),
        ),
      );
    await i.showModal(modal);
  }

  function parseProjectExtra(raw: string): { industry?: string; websiteUrl?: string; repoUrl?: string; lookingForRoles?: string } {
    const result: any = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.includes(':')) continue;
      const [key, ...rest] = trimmed.split(':');
      const val = rest.join(':').trim();
      switch (key.trim().toLowerCase()) {
        case 'industry': result.industry = val || undefined; break;
        case 'website': case 'website_url': case 'url': result.websiteUrl = val || undefined; break;
        case 'repo': case 'repo_url': case 'github': result.repoUrl = val || undefined; break;
        case 'looking_for': case 'looking_for_roles': case 'roles': result.lookingForRoles = val || undefined; break;
      }
    }
    return result;
  }

  async function handleProjectAddModal(i: ModalSubmitInteraction): Promise<void> {
    const name = i.fields.getTextInputValue('name');
    const description = i.fields.getTextInputValue('description');
    const stage = i.fields.getTextInputValue('stage');
    const techStack = i.fields.getTextInputValue('tech_stack') || null;
    const extra = parseProjectExtra(i.fields.getTextInputValue('extra') || '');

    store.createProject(i.user.id, {
      name,
      description,
      stage,
      techStack,
      ...extra,
    });
    await i.reply({ content: `Project **${name}** added!`, ephemeral: true });
  }

  async function handleProjectEdit(i: ChatInputCommandInteraction): Promise<void> {
    const founder = store.getFounder(i.user.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder yet.', ephemeral: true });
      return;
    }
    const projectName = i.options.getString('project', true);
    const proj = store.getProjectByName(i.user.id, projectName);
    if (!proj) {
      await i.reply({ content: `Project "${projectName}" not found.`, ephemeral: true });
      return;
    }

    const extraLines: string[] = [];
    if (proj.industry) extraLines.push(`industry: ${proj.industry}`);
    if (proj.websiteUrl) extraLines.push(`website: ${proj.websiteUrl}`);
    if (proj.repoUrl) extraLines.push(`repo: ${proj.repoUrl}`);
    if (proj.lookingForRoles) extraLines.push(`looking_for: ${proj.lookingForRoles}`);

    const modal = new ModalBuilder()
      .setCustomId(`${FOUNDERS_MODAL_PREFIX}project_edit:${proj.id}`)
      .setTitle('Edit Project')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Project name').setMaxLength(100).setStyle(TextInputStyle.Short).setRequired(true).setValue(proj.name),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Description').setMaxLength(500).setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(proj.description ?? ''),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('stage').setLabel('Stage').setMaxLength(20).setStyle(TextInputStyle.Short).setRequired(true).setValue(proj.stage ?? ''),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('tech_stack').setLabel('Tech stack').setMaxLength(200).setStyle(TextInputStyle.Short).setRequired(false).setValue(proj.techStack ?? ''),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('extra').setLabel('Extra').setMaxLength(600).setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(extraLines.join('\n')),
        ),
      );
    await i.showModal(modal);
  }

  async function handleProjectEditModal(i: ModalSubmitInteraction, projectId: number): Promise<void> {
    const name = i.fields.getTextInputValue('name');
    const description = i.fields.getTextInputValue('description');
    const stage = i.fields.getTextInputValue('stage');
    const techStack = i.fields.getTextInputValue('tech_stack') || null;
    const extra = parseProjectExtra(i.fields.getTextInputValue('extra') || '');

    store.updateProject(projectId, {
      name,
      description,
      stage,
      techStack,
      ...extra,
    });
    await i.reply({ content: `Project **${name}** updated!`, ephemeral: true });
  }

  async function handleProjectPrimary(i: ChatInputCommandInteraction): Promise<void> {
    const founder = store.getFounder(i.user.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder yet.', ephemeral: true });
      return;
    }
    if (founder.level < 2) {
      await i.reply({ content: 'Primary project pinning unlocks at **Founder - Caterpillar (Level 2)**.', ephemeral: true });
      return;
    }
    const projectName = i.options.getString('project', true);
    const proj = store.getProjectByName(i.user.id, projectName);
    if (!proj) {
      await i.reply({ content: `Project "${projectName}" not found.`, ephemeral: true });
      return;
    }
    const ok = store.setPrimaryProject(i.user.id, proj.id);
    if (!ok) {
      await i.reply({ content: 'Could not set primary project.', ephemeral: true });
      return;
    }
    await i.reply({ content: `Primary project set to **${proj.name}** \u2B50`, ephemeral: true });
  }

  async function handleProjects(i: ChatInputCommandInteraction): Promise<void> {
    const target = i.options.getUser('user') ?? i.user;
    const founder = store.getFounder(target.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder.', ephemeral: true });
      return;
    }
    const projs = store.getProjects(target.id);
    if (!projs.length) {
      await i.reply({ content: 'No projects yet. Use /project_add.', ephemeral: true });
      return;
    }
    await i.reply({
      embeds: projs.slice(0, 5).map((p) => embedToApi(projectEmbed(p))),
      ephemeral: true,
    });
  }

  async function handleDaily(i: ChatInputCommandInteraction): Promise<void> {
    const founder = store.getFounder(i.user.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder yet. Use /join_founders first.', ephemeral: true });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`${FOUNDERS_MODAL_PREFIX}daily`)
      .setTitle('Daily Standup')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('content').setLabel('What did you work on today?').setPlaceholder('Shipped the auth flow, fixed 3 bugs...').setMaxLength(500).setStyle(TextInputStyle.Paragraph).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('next_up').setLabel("What's next?").setPlaceholder('Working on the payment integration...').setMaxLength(200).setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('blockers').setLabel('Any blockers?').setPlaceholder('Waiting on API keys, stuck on a bug...').setMaxLength(200).setStyle(TextInputStyle.Short).setRequired(false),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('feedback_url').setLabel('Feedback link (optional)').setPlaceholder('https://your-project.com/feedback').setMaxLength(500).setStyle(TextInputStyle.Short).setRequired(false),
        ),
      );
    await i.showModal(modal);
  }

  async function handleDailyModal(i: ModalSubmitInteraction): Promise<void> {
    const content = i.fields.getTextInputValue('content');
    const nextUp = i.fields.getTextInputValue('next_up');
    const blockers = i.fields.getTextInputValue('blockers') || null;
    const feedbackUrl = i.fields.getTextInputValue('feedback_url') || null;

    const combined = `${content}\n\n**What's next:** ${nextUp}`;
    const today = todayIso(timezone);
    const current = store.getFounder(i.user.id);
    const oldLevel = current?.level ?? 1;

    const [checkin, xp, leveledUp, error] = store.recordDailyCheckin(
      i.user.id,
      combined,
      blockers,
      feedbackUrl,
      today,
    );
    if (error) {
      await i.reply({ content: error, ephemeral: true });
      return;
    }

    const updated = store.getFounder(i.user.id);
    const bonus = Math.max(0, xp - XP_DAILY_CHECKIN);
    const remaining = updated ? xpToNextLevel(updated.xp) : null;

    let msg = `Daily check-in recorded! +${xp} XP`;
    if (bonus) msg += ` (+${XP_DAILY_CHECKIN} base +${bonus} streak)`;
    if (updated) {
      msg += remaining === null
        ? `\nTotal: ${updated.xp} XP (MAX)`
        : `\nTotal: ${updated.xp} XP (${remaining} to next level)`;
      if (leveledUp)
        msg += `\nLevel up! You're now L${updated.level} ${levelInfo(updated.level).name}.`;
    }

    const dailyCh = await resolveChannel(i as any, 'daily');
    if (dailyCh) msg += `\nPosted in <#${dailyCh.id}>.`;
    await i.reply({ content: msg, ephemeral: true });

    // Post to daily channel.
    if (dailyCh && checkin && updated) {
      const member = i.guild?.members.cache.get(i.user.id) ?? null;
      try {
        await dailyCh.send({
          embeds: [embedToApi(dailyCheckinEmbed(checkin, updated, avatarUrl(member)))],
        });
      } catch { /* */ }
    }

    if (leveledUp) await handleLevelUp(i as any, i.user.id, oldLevel);
  }

  async function handleWeekly(i: ChatInputCommandInteraction): Promise<void> {
    const founder = store.getFounder(i.user.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder yet. Use /join_founders first.', ephemeral: true });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`${FOUNDERS_MODAL_PREFIX}weekly`)
      .setTitle('Weekly Update')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('content').setLabel('Key milestones this week').setPlaceholder('Launched MVP, got first 10 users...').setMaxLength(500).setStyle(TextInputStyle.Paragraph).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('lessons').setLabel('Lessons learned').setPlaceholder("What worked, what didn't...").setMaxLength(500).setStyle(TextInputStyle.Paragraph).setRequired(false),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('metrics').setLabel('Key metrics').setPlaceholder('Users: 50, Revenue: $100, Signups: 20...').setMaxLength(200).setStyle(TextInputStyle.Short).setRequired(false),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('feedback_url').setLabel('Feedback link (optional)').setPlaceholder('https://your-project.com').setMaxLength(500).setStyle(TextInputStyle.Short).setRequired(false),
        ),
      );
    await i.showModal(modal);
  }

  async function handleWeeklyModal(i: ModalSubmitInteraction): Promise<void> {
    const content = i.fields.getTextInputValue('content');
    const lessons = i.fields.getTextInputValue('lessons') || null;
    const metrics = i.fields.getTextInputValue('metrics') || null;
    const feedbackUrl = i.fields.getTextInputValue('feedback_url') || null;

    const today = todayIso(timezone);
    const current = store.getFounder(i.user.id);
    const oldLevel = current?.level ?? 1;

    const [checkin, xp, leveledUp, error] = store.recordWeeklyCheckin(
      i.user.id,
      content,
      null,
      lessons,
      metrics,
      feedbackUrl,
      today,
    );
    if (error) {
      await i.reply({ content: error, ephemeral: true });
      return;
    }

    const updated = store.getFounder(i.user.id);
    const bonus = Math.max(0, xp - XP_WEEKLY_UPDATE);
    const remaining = updated ? xpToNextLevel(updated.xp) : null;

    let msg = `Weekly update recorded! +${xp} XP`;
    if (bonus) msg += ` (+${XP_WEEKLY_UPDATE} base +${bonus} streak)`;
    if (updated) {
      msg += remaining === null
        ? `\nTotal: ${updated.xp} XP (MAX)`
        : `\nTotal: ${updated.xp} XP (${remaining} to next level)`;
      if (leveledUp)
        msg += `\nLevel up! You're now L${updated.level} ${levelInfo(updated.level).name}.`;
    }

    const weeklyCh = await resolveChannel(i as any, 'weekly');
    if (weeklyCh) msg += `\nPosted in <#${weeklyCh.id}>.`;
    await i.reply({ content: msg, ephemeral: true });

    if (weeklyCh && checkin && updated) {
      const member = i.guild?.members.cache.get(i.user.id) ?? null;
      try {
        await weeklyCh.send({
          embeds: [embedToApi(weeklyCheckinEmbed(checkin, updated, avatarUrl(member)))],
        });
      } catch { /* */ }
    }

    if (leveledUp) await handleLevelUp(i as any, i.user.id, oldLevel);
  }

  async function handleFeedback(i: ChatInputCommandInteraction): Promise<void> {
    const giver = store.getFounder(i.user.id);
    if (!giver) {
      await i.reply({ content: 'Not a Founder yet. Use /join_founders first.', ephemeral: true });
      return;
    }
    const targetUser = i.options.getUser('user', true);
    if (targetUser.id === i.user.id) {
      await i.reply({ content: "You can't give feedback to yourself.", ephemeral: true });
      return;
    }
    const receiver = store.getFounder(targetUser.id);
    if (!receiver) {
      await i.reply({ content: `${targetUser.displayName} isn't a Founder yet.`, ephemeral: true });
      return;
    }

    // Check channel restriction.
    const feedbackCh = await resolveChannel(i, 'feedback');
    if (feedbackCh && i.channelId !== feedbackCh.id) {
      await i.reply({
        content: `Please use this in <#${feedbackCh.id}> so the community can see it.`,
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`${FOUNDERS_MODAL_PREFIX}feedback:${targetUser.id}`)
      .setTitle('Give Feedback')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('feedback').setLabel('Your feedback').setPlaceholder('What worked well? What would you change? Be specific and constructive.').setMaxLength(900).setStyle(TextInputStyle.Paragraph).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('link').setLabel('Link (optional)').setPlaceholder('https://... (Figma, website, repo, Loom, etc.)').setMaxLength(500).setStyle(TextInputStyle.Short).setRequired(false),
        ),
      );
    await i.showModal(modal);
  }

  async function handleFeedbackModal(i: ModalSubmitInteraction, receiverId: string): Promise<void> {
    const text = i.fields.getTextInputValue('feedback').trim();
    const link = i.fields.getTextInputValue('link') || null;

    if (text.length < 30) {
      await i.reply({ content: 'Feedback must be at least 30 characters.', ephemeral: true });
      return;
    }

    const current = store.getFounder(i.user.id);
    const oldLevel = current?.level ?? 1;
    const today = todayIso(timezone);

    const [xp, leveledUp, error] = store.recordFeedback(
      i.user.id,
      receiverId,
      today,
      null,
      i.channelId ?? null,
    );
    if (error) {
      await i.reply({ content: error, ephemeral: true });
      return;
    }

    const updated = store.getFounder(i.user.id);
    const remaining = updated ? xpToNextLevel(updated.xp) : null;
    let msg = `Feedback recorded! +${xp} XP`;
    if (updated) {
      msg += remaining === null
        ? `\nTotal: ${updated.xp} XP (MAX)`
        : `\nTotal: ${updated.xp} XP (${remaining} to next level)`;
      if (leveledUp)
        msg += `\nLevel up! You're now L${updated.level} ${levelInfo(updated.level).name}.`;
    }
    await i.reply({ content: msg, ephemeral: true });

    // Post feedback publicly.
    const feedbackCh = (await resolveChannel(i as any, 'feedback')) ?? (i.channel?.isTextBased() ? (i.channel as TextChannel) : null);
    if (feedbackCh) {
      try {
        await feedbackCh.send({
          embeds: [embedToApi(feedbackEmbed(i.user.id, receiverId, text, link, xp))],
        });
      } catch { /* */ }
    }

    if (leveledUp) await handleLevelUp(i as any, i.user.id, oldLevel);
  }

  async function handleMilestone(i: ChatInputCommandInteraction): Promise<void> {
    const founder = store.getFounder(i.user.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder yet.', ephemeral: true });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`${FOUNDERS_MODAL_PREFIX}milestone`)
      .setTitle('Record Milestone')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('type').setLabel('Milestone type').setPlaceholder('mvp_launch / first_user / revenue / custom').setMaxLength(20).setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('title').setLabel('Title').setPlaceholder('Launched MVP to 100 beta users').setMaxLength(100).setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Description (optional)').setPlaceholder('Tell us about this milestone...').setMaxLength(500).setStyle(TextInputStyle.Paragraph).setRequired(false),
        ),
      );
    await i.showModal(modal);
  }

  async function handleMilestoneModal(i: ModalSubmitInteraction): Promise<void> {
    const milestoneType = i.fields.getTextInputValue('type');
    const title = i.fields.getTextInputValue('title');
    const description = i.fields.getTextInputValue('description') || null;

    const current = store.getFounder(i.user.id);
    const oldLevel = current?.level ?? 1;
    const projs = store.getProjects(i.user.id);
    const primary = projs.find((p) => p.isPrimary) ?? projs[0] ?? null;

    const [xp, newLevel, leveledUp, error] = store.recordMilestone(
      i.user.id,
      milestoneType,
      title,
      description,
      primary?.id ?? null,
    );
    if (error) {
      await i.reply({ content: error, ephemeral: true });
      return;
    }

    const updated = store.getFounder(i.user.id);
    const remaining = updated ? xpToNextLevel(updated.xp) : null;
    let msg = `Milestone recorded: **${title}** (+${xp} XP)`;
    if (updated) {
      msg += remaining === null
        ? `\nTotal: ${updated.xp} XP (MAX)`
        : `\nTotal: ${updated.xp} XP (${remaining} to next level)`;
      if (leveledUp)
        msg += `\nLevel up! You're now L${updated.level} ${levelInfo(updated.level).name}.`;
    }

    const msCh = await resolveChannel(i as any, 'milestones');
    if (msCh) msg += `\nPosted in <#${msCh.id}>.`;
    await i.reply({ content: msg, ephemeral: true });

    if (msCh) {
      const member = i.guild?.members.cache.get(i.user.id) ?? null;
      try {
        await msCh.send({
          embeds: [embedToApi(milestoneEmbed(i.user.id, title, milestoneType, description, xp, avatarUrl(member)))],
        });
      } catch { /* */ }
    }

    if (leveledUp) await handleLevelUp(i as any, i.user.id, oldLevel);
  }

  async function handleLeaderboard(i: ChatInputCommandInteraction): Promise<void> {
    const perPage = 10;
    const founders = store.leaderboard(perPage, 0);
    const total = store.countFounders();
    const maxPage = Math.max(0, Math.ceil(total / perPage) - 1);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('founders:lb:prev:0').setLabel('\u25C0 Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('founders:lb:next:0').setLabel('Next \u25B6').setStyle(ButtonStyle.Secondary).setDisabled(maxPage <= 0),
    );
    await i.reply({
      embeds: [embedToApi(leaderboardEmbed(founders, 0, perPage))],
      components: [row],
      ephemeral: true,
    });
  }

  async function handleFoundersDirectory(i: ChatInputCommandInteraction): Promise<void> {
    const skill = i.options.getString('skill') ?? null;
    const perPage = 5;
    const founders = store.listFounders({ skillFilter: skill, limit: perPage });
    const total = store.countFounders({ skillFilter: skill });
    const maxPage = Math.max(0, Math.ceil(total / perPage) - 1);
    const filterParam = skill ? `:${encodeURIComponent(skill)}` : '';

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`founders:dir:prev:0${filterParam}`).setLabel('\u25C0 Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(`founders:dir:next:0${filterParam}`).setLabel('Next \u25B6').setStyle(ButtonStyle.Secondary).setDisabled(maxPage <= 0),
    );
    await i.reply({
      embeds: [embedToApi(directoryEmbed(founders, 0, perPage, total, skill))],
      components: [row],
      ephemeral: true,
    });
  }

  async function handleCofounderOptIn(i: ChatInputCommandInteraction): Promise<void> {
    const founder = store.getFounder(i.user.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder yet. Use /join_founders first.', ephemeral: true });
      return;
    }
    store.setOptInMatching(i.user.id, true);
    await i.reply({
      content: "You're now visible in cofounder search! Others can find you with `/cofounder_search`.\nUse `/profile_edit` to update your skills and what you're looking for.",
      ephemeral: true,
    });
  }

  async function handleCofounderOptOut(i: ChatInputCommandInteraction): Promise<void> {
    const founder = store.getFounder(i.user.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder.', ephemeral: true });
      return;
    }
    store.setOptInMatching(i.user.id, false);
    await i.reply({ content: "You've been removed from cofounder search.", ephemeral: true });
  }

  async function handleCofounderSearch(i: ChatInputCommandInteraction): Promise<void> {
    const skill = i.options.getString('skill') ?? null;
    const perPage = 5;
    const founders = store.listFounders({ skillFilter: skill, optInOnly: true, limit: perPage });
    const total = store.countFounders({ skillFilter: skill, optInOnly: true });

    if (!founders.length) {
      let msg = 'No founders matched';
      if (skill) msg += ` with skill "${skill}"`;
      msg += '. Try a different skill or check back later.';
      await i.reply({ content: msg, ephemeral: true });
      return;
    }

    const maxPage = Math.max(0, Math.ceil(total / perPage) - 1);
    const filterParam = skill ? `:${encodeURIComponent(skill)}` : '';
    const embed = directoryEmbed(founders, 0, perPage, total, skill);
    embed.title = '\u{1F91D} Cofounder Search';

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`founders:cosearch:prev:0${filterParam}`).setLabel('\u25C0 Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(`founders:cosearch:next:0${filterParam}`).setLabel('Next \u25B6').setStyle(ButtonStyle.Secondary).setDisabled(maxPage <= 0),
    );
    await i.reply({
      embeds: [embedToApi(embed)],
      components: [row],
      ephemeral: true,
    });
  }

  async function handleShowcase(i: ChatInputCommandInteraction): Promise<void> {
    const founder = store.getFounder(i.user.id);
    if (!founder) {
      await i.reply({ content: 'Not a Founder yet.', ephemeral: true });
      return;
    }

    const today = todayIso(timezone);
    const [can, error] = store.canShowcase(i.user.id, today);
    if (!can) {
      await i.reply({ content: error, ephemeral: true });
      return;
    }

    const projs = store.getProjects(i.user.id);
    const primary = projs.find((p) => p.isPrimary) ?? projs[0] ?? null;
    if (!primary) {
      await i.reply({ content: 'Add a project first with /project_add.', ephemeral: true });
      return;
    }

    const current = store.getFounder(i.user.id);
    const oldLevel = current?.level ?? 1;
    const [xp, leveledUp] = store.recordShowcase(i.user.id, today);

    const updated = store.getFounder(i.user.id);
    const remaining = updated ? xpToNextLevel(updated.xp) : null;
    let msg = `Project showcased! +${xp} XP`;
    if (updated) {
      msg += remaining === null
        ? `\nTotal: ${updated.xp} XP (MAX)`
        : `\nTotal: ${updated.xp} XP (${remaining} to next level)`;
      if (leveledUp)
        msg += `\nLevel up! You're now L${updated.level} ${levelInfo(updated.level).name}.`;
    }

    const showcaseCh = await resolveChannel(i, 'showcase');
    if (showcaseCh) msg += `\nPosted in <#${showcaseCh.id}>.`;
    await i.reply({ content: msg, ephemeral: true });

    if (showcaseCh && updated) {
      const member = i.guild?.members.cache.get(i.user.id) ?? null;
      const embed = projectEmbed(primary);
      embed.title = `\u{1F3C6} ${primary.name}`;
      embed.author = { name: `${updated.displayName} (L${updated.level} ${levelInfo(updated.level).name})` };
      if (avatarUrl(member)) embed.thumbnail = { url: avatarUrl(member)! };
      try {
        await showcaseCh.send({ embeds: [embedToApi(embed)] });
      } catch { /* */ }
    }

    if (leveledUp) await handleLevelUp(i, i.user.id, oldLevel);
  }

  // ── Button Handlers (pagination) ───────────────────────────────────────

  async function handleButton(i: ButtonInteraction): Promise<void> {
    const id = i.customId;

    // Parse: founders:<type>:<direction>:<page>[:filter]
    if (id.startsWith('founders:lb:') || id.startsWith('founders:dir:') || id.startsWith('founders:cosearch:')) {
      const parts = id.split(':');
      const type = parts[1]; // lb, dir, cosearch
      const direction = parts[2]; // prev, next
      const currentPage = parseInt(parts[3], 10);
      const filter = parts[4] ? decodeURIComponent(parts[4]) : null;

      const newPage = direction === 'next' ? currentPage + 1 : Math.max(0, currentPage - 1);

      if (type === 'lb') {
        const perPage = 10;
        const founders = store.leaderboard(perPage, newPage * perPage);
        const total = store.countFounders();
        const maxPage = Math.max(0, Math.ceil(total / perPage) - 1);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`founders:lb:prev:${newPage}`).setLabel('\u25C0 Previous').setStyle(ButtonStyle.Secondary).setDisabled(newPage <= 0),
          new ButtonBuilder().setCustomId(`founders:lb:next:${newPage}`).setLabel('Next \u25B6').setStyle(ButtonStyle.Secondary).setDisabled(newPage >= maxPage),
        );
        await i.update({
          embeds: [embedToApi(leaderboardEmbed(founders, newPage, perPage))],
          components: [row],
        });
      } else {
        const perPage = 5;
        const optInOnly = type === 'cosearch';
        const founders = store.listFounders({ skillFilter: filter, optInOnly, limit: perPage, offset: newPage * perPage });
        const total = store.countFounders({ skillFilter: filter, optInOnly });
        const maxPage = Math.max(0, Math.ceil(total / perPage) - 1);
        const filterParam = filter ? `:${encodeURIComponent(filter)}` : '';
        const embed = directoryEmbed(founders, newPage, perPage, total, filter);
        if (type === 'cosearch') embed.title = '\u{1F91D} Cofounder Search';
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`founders:${type}:prev:${newPage}${filterParam}`).setLabel('\u25C0 Previous').setStyle(ButtonStyle.Secondary).setDisabled(newPage <= 0),
          new ButtonBuilder().setCustomId(`founders:${type}:next:${newPage}${filterParam}`).setLabel('Next \u25B6').setStyle(ButtonStyle.Secondary).setDisabled(newPage >= maxPage),
        );
        await i.update({ embeds: [embedToApi(embed)], components: [row] });
      }
      return;
    }

    // Join button from welcome post.
    if (id === 'founders:join') {
      const member = i.member as GuildMember | null;
      if (!member || !hasProRole(member)) {
        await i.reply({
          content: 'The Founders is available to **Explorer** subscribers and above.',
          ephemeral: true,
        });
        return;
      }
      if (store.getFounder(i.user.id)) {
        await i.reply({ content: "You're already a Founder!", ephemeral: true });
        return;
      }
      // Show join modal.
      const modal = new ModalBuilder()
        .setCustomId(`${FOUNDERS_MODAL_PREFIX}join`)
        .setTitle('Join The Founders')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('project_name').setLabel('Project Name').setPlaceholder("What's your project called?").setMaxLength(100).setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('project_description').setLabel('What are you building?').setPlaceholder('Describe your project in a few sentences...').setMaxLength(500).setStyle(TextInputStyle.Paragraph).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('skills').setLabel('Your skills').setPlaceholder('Python, React, ML, Design...').setMaxLength(200).setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('looking_for').setLabel('What help do you need?').setPlaceholder('Frontend dev, designer, marketing...').setMaxLength(200).setStyle(TextInputStyle.Short).setRequired(false),
          ),
        );
      await i.showModal(modal);
    }
  }

  // ── Autocomplete Handler ───────────────────────────────────────────────

  async function handleAutocomplete(i: AutocompleteInteraction): Promise<void> {
    const current = i.options.getFocused();
    const names = store.projectNames(i.user.id);
    const filtered = names
      .filter((n) => n.toLowerCase().includes(current.toLowerCase()))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));
    await i.respond(filtered);
  }

  // ── Main Router ────────────────────────────────────────────────────────

  async function handleInteraction(interaction: Interaction): Promise<boolean> {
    try {
      // Slash commands.
      if (interaction.isChatInputCommand() && FOUNDERS_COMMANDS.has(interaction.commandName)) {
        switch (interaction.commandName) {
          case 'join_founders': await handleJoinFounders(interaction); break;
          case 'profile': await handleProfile(interaction); break;
          case 'profile_edit': await handleProfileEdit(interaction); break;
          case 'project_add': await handleProjectAdd(interaction); break;
          case 'project_edit': await handleProjectEdit(interaction); break;
          case 'project_primary': await handleProjectPrimary(interaction); break;
          case 'projects': await handleProjects(interaction); break;
          case 'daily': await handleDaily(interaction); break;
          case 'weekly': await handleWeekly(interaction); break;
          case 'feedback': await handleFeedback(interaction); break;
          case 'milestone': await handleMilestone(interaction); break;
          case 'leaderboard': await handleLeaderboard(interaction); break;
          case 'founders': await handleFoundersDirectory(interaction); break;
          case 'cofounder_opt_in': await handleCofounderOptIn(interaction); break;
          case 'cofounder_opt_out': await handleCofounderOptOut(interaction); break;
          case 'cofounder_search': await handleCofounderSearch(interaction); break;
          case 'showcase': await handleShowcase(interaction); break;
        }
        return true;
      }

      // Modal submits.
      if (interaction.isModalSubmit() && interaction.customId.startsWith(FOUNDERS_MODAL_PREFIX)) {
        const modalId = interaction.customId.slice(FOUNDERS_MODAL_PREFIX.length);
        if (modalId === 'join') { await handleJoinModal(interaction); return true; }
        if (modalId === 'profile_edit') { await handleProfileEditModal(interaction); return true; }
        if (modalId === 'project_add') { await handleProjectAddModal(interaction); return true; }
        if (modalId.startsWith('project_edit:')) {
          const projectId = parseInt(modalId.split(':')[1], 10);
          await handleProjectEditModal(interaction, projectId);
          return true;
        }
        if (modalId === 'daily') { await handleDailyModal(interaction); return true; }
        if (modalId === 'weekly') { await handleWeeklyModal(interaction); return true; }
        if (modalId.startsWith('feedback:')) {
          const receiverId = modalId.split(':')[1];
          await handleFeedbackModal(interaction, receiverId);
          return true;
        }
        if (modalId === 'milestone') { await handleMilestoneModal(interaction); return true; }
      }

      // Button interactions.
      if (interaction.isButton() && interaction.customId.startsWith(FOUNDERS_BUTTON_PREFIX)) {
        await handleButton(interaction);
        return true;
      }

      // Autocomplete.
      if (interaction.isAutocomplete() && FOUNDERS_COMMANDS.has(interaction.commandName)) {
        await handleAutocomplete(interaction);
        return true;
      }
    } catch (err) {
      console.error('[Founders] Interaction error:', err);
      try {
        if (interaction.isRepliable() && !(interaction as any).replied && !(interaction as any).deferred) {
          await (interaction as any).reply({ content: 'Something went wrong. Please try again.', ephemeral: true });
        }
      } catch { /* */ }
    }

    return false; // Not a Founders interaction.
  }

  // ── Welcome Post ───────────────────────────────────────────────────────

  async function ensureWelcomePost(client: any): Promise<void> {
    if (!channels?.welcome || !config.guildId) return;
    try {
      const guild = await client.guilds.fetch(config.guildId);
      const ch = guild.channels.cache.get(channels.welcome) as TextChannel | undefined;
      if (!ch?.isTextBased()) return;

      // Check if we already posted.
      const messages = await ch.messages.fetch({ limit: 25 });
      const existing = messages.find(
        (m: any) =>
          m.author.id === client.user?.id &&
          m.components?.some?.((row: any) =>
            row.components?.some?.((c: any) => c.customId === 'founders:join'),
          ),
      );

      const embed = embedToApi(welcomeProgramEmbed());
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('founders:join')
          .setLabel('Join The Founders')
          .setEmoji('\u{1F407}')
          .setStyle(ButtonStyle.Success),
      );

      if (existing) {
        await existing.edit({ embeds: [embed], components: [row] });
        if (!existing.pinned) try { await existing.pin(); } catch { /* */ }
      } else {
        const sent = await ch.send({ embeds: [embed], components: [row] });
        try { await sent.pin(); } catch { /* */ }
      }
    } catch (err) {
      console.error('[Founders] Welcome post error:', err);
    }
  }

  return {
    handleInteraction,
    ensureWelcomePost,
  };
}
