/**
 * Verify interaction handler — processes /verify slash command and
 * the persistent "I've verified — check now" button.
 */

import {
  type Interaction,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type GuildMember,
  type Guild,
  type Role,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import { VerifyClient, type VerifyStatusResult } from '../api/verifyClient.js';
import {
  verifyPromptEmbed,
  alreadyVerifiedEmbed,
  accountLinkedEmbed,
} from '../embeds/index.js';

// ── Config ──────────────────────────────────────────────────────────────────

export interface VerifyHandlerConfig {
  /** Restrict /verify to this channel. If empty, allow everywhere. */
  channelId?: string;
  /** RabbitHole backend URL (e.g. http://localhost:3001). */
  apiUrl?: string;
  /** Internal secret for the RabbitHole API. */
  apiSecret?: string;
  /** Frontend URL for the verification page. */
  frontendUrl?: string;
  /** Role names for subscription tiers. */
  roles?: {
    explorer?: string;
    pioneer?: string;
    enterprise?: string;
    member?: string;
  };
}

// ── Role mapping ────────────────────────────────────────────────────────────

function buildPlanToRole(roles: VerifyHandlerConfig['roles']): Record<string, string> {
  const explorer = roles?.explorer || process.env.ROLE_EXPLORER || 'Explorer';
  const pioneer = roles?.pioneer || process.env.ROLE_PIONEER || 'Pioneer';
  const enterprise = roles?.enterprise || process.env.ROLE_ENTERPRISE_ALIAS || 'Enterprise';
  return {
    'basic': explorer,
    'creator': explorer,
    'global-pass': explorer,
    'rh-pioneer-monthly': pioneer,
    'rh-pioneer-annual': pioneer,
    'rh-lifetime': pioneer,
    'organization': enterprise,
  };
}

function subscriptionRoleNames(roles: VerifyHandlerConfig['roles']): Set<string> {
  return new Set([
    roles?.explorer || process.env.ROLE_EXPLORER || 'Explorer',
    roles?.pioneer || process.env.ROLE_PIONEER || 'Pioneer',
    roles?.enterprise || process.env.ROLE_ENTERPRISE_ALIAS || 'Enterprise',
  ]);
}

function determineRole(
  status: VerifyStatusResult,
  planToRole: Record<string, string>,
  memberRoleName: string,
): string {
  if (
    status.subscription_status === 'active' &&
    status.subscription_plan_id &&
    planToRole[status.subscription_plan_id]
  ) {
    return planToRole[status.subscription_plan_id];
  }
  return memberRoleName;
}

async function syncRoles(
  member: GuildMember,
  guild: Guild,
  targetRoleName: string,
  subRoles: Set<string>,
  memberRoleName: string,
): Promise<void> {
  // Remove old subscription/member roles that don't match
  const rolesToRemove: Role[] = [];
  for (const name of [...subRoles, memberRoleName]) {
    if (name === targetRoleName) continue;
    const role = guild.roles.cache.find((r) => r.name === name);
    if (role && member.roles.cache.has(role.id)) {
      rolesToRemove.push(role);
    }
  }
  if (rolesToRemove.length) {
    try {
      await member.roles.remove(rolesToRemove, 'Verify: role sync');
    } catch { /* ignore permission errors */ }
  }
  // Add target role
  const targetRole = guild.roles.cache.find((r) => r.name === targetRoleName);
  if (targetRole && !member.roles.cache.has(targetRole.id)) {
    try {
      await member.roles.add(targetRole, 'Verify: account linked');
    } catch { /* ignore permission errors */ }
  }
}

// ── Handler factory ─────────────────────────────────────────────────────────

export function createVerifyHandler(config: VerifyHandlerConfig) {
  const apiUrl = config.apiUrl || process.env.RABBITHOLE_API_URL || 'http://localhost:3001';
  const apiSecret = config.apiSecret || process.env.RABBITHOLE_API_SECRET || '';
  const frontendUrl = (config.frontendUrl || process.env.RABBITHOLE_FRONTEND_URL || 'https://rabbithole.inc').replace(/\/+$/, '');
  const channelId = config.channelId || '';
  const memberRoleName = config.roles?.member || process.env.ROLE_MEMBER || 'Member';

  const client = new VerifyClient(apiUrl, apiSecret);
  const planToRole = buildPlanToRole(config.roles);
  const subRoles = subscriptionRoleNames(config.roles);

  // ── Check button (persistent, custom_id = "verify:check_status") ────────

  async function handleCheckButton(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    if (!client.isConfigured()) {
      await interaction.followUp({ content: 'Verification is not configured. Please contact an admin.', ephemeral: true });
      return;
    }

    let status: VerifyStatusResult;
    try {
      status = await client.checkStatus(interaction.user.id);
    } catch (err: any) {
      await interaction.followUp({ content: `Failed to check status: ${err?.message ?? err}`, ephemeral: true });
      return;
    }

    if (!status.verified) {
      await interaction.followUp({
        content: "Your Discord account is not yet linked. Click the verification link above and log into your RabbitHole account first.",
        ephemeral: true,
      });
      return;
    }

    const member = interaction.guild?.members.cache.get(interaction.user.id)
      ?? (interaction.guild ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null) : null);
    if (!member || !interaction.guild) {
      await interaction.followUp({ content: 'Could not find your server membership. Please try again.', ephemeral: true });
      return;
    }

    const roleName = determineRole(status, planToRole, memberRoleName);
    await syncRoles(member, interaction.guild, roleName, subRoles, memberRoleName);

    const embed = accountLinkedEmbed(
      status.display_name || interaction.user.displayName,
      status.subscription_status || 'none',
      status.subscription_plan_id || 'free',
      roleName,
    );
    await interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  // ── /verify slash command ─────────────────────────────────────────────────

  async function handleVerifyCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // Channel restriction
    if (channelId && interaction.channelId !== channelId) {
      await interaction.reply({
        content: `Please use this command in <#${channelId}>.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    if (!client.isConfigured()) {
      await interaction.followUp({ content: 'Verification is not configured. Please contact an admin.', ephemeral: true });
      return;
    }

    // Check if already verified
    let status: VerifyStatusResult;
    try {
      status = await client.checkStatus(interaction.user.id);
    } catch {
      status = { verified: false };
    }

    if (status.verified) {
      // Refresh roles
      const member = interaction.guild?.members.cache.get(interaction.user.id)
        ?? (interaction.guild ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null) : null);
      if (member && interaction.guild) {
        const roleName = determineRole(status, planToRole, memberRoleName);
        await syncRoles(member, interaction.guild, roleName, subRoles, memberRoleName);
      }

      const roleName = determineRole(status, planToRole, memberRoleName);
      const embed = alreadyVerifiedEmbed(
        status.display_name || interaction.user.displayName,
        status.subscription_status || 'none',
        status.subscription_plan_id || 'free',
        roleName,
      );
      await interaction.followUp({ embeds: [embed], ephemeral: true });
      return;
    }

    // Create a new verification token
    let token: string;
    try {
      const result = await client.createToken(interaction.user.id);
      token = result.token;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.includes('429')) {
        await interaction.followUp({ content: "You've requested too many verification links recently. Please try again later.", ephemeral: true });
      } else {
        await interaction.followUp({ content: `Failed to create verification link: ${msg}`, ephemeral: true });
      }
      return;
    }

    const verifyUrl = `${frontendUrl}/verify/discord?token=${token}`;
    const embed = verifyPromptEmbed(verifyUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('verify:check_status')
        .setLabel("I've verified \u2014 check now")
        .setStyle(ButtonStyle.Success),
    );

    await interaction.followUp({ embeds: [embed], components: [row], ephemeral: true });
  }

  // ── Main interaction dispatcher ───────────────────────────────────────────

  async function handleInteraction(interaction: Interaction): Promise<boolean> {
    if (interaction.isChatInputCommand() && interaction.commandName === 'verify') {
      await handleVerifyCommand(interaction);
      return true;
    }
    if (interaction.isButton() && interaction.customId === 'verify:check_status') {
      await handleCheckButton(interaction);
      return true;
    }
    return false;
  }

  return { handleInteraction };
}
