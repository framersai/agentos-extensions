/**
 * Discord embed builders for the /verify command.
 */

import type { APIEmbed } from 'discord.js';

const BRAND_COLOR = 0x8b6914;
const FOOTER_TEXT = 'Powered by Wunderbots | rabbithole.inc';

export function verifyPromptEmbed(verifyUrl: string): APIEmbed {
  return {
    title: 'Verify Your Account',
    description:
      'Link your Discord account to your RabbitHole account to get your roles.\n\n' +
      `**[Click here to verify](${verifyUrl})**\n\n` +
      '1. Click the link above\n' +
      '2. Log into your RabbitHole account\n' +
      '3. Click **Confirm Link**\n' +
      '4. Come back here and click the button below\n\n' +
      '*This link expires in 15 minutes.*',
    color: BRAND_COLOR,
    footer: { text: FOOTER_TEXT },
  };
}

export function alreadyVerifiedEmbed(
  displayName: string,
  subStatus: string,
  planId: string,
  roleName: string,
): APIEmbed {
  return {
    title: 'Already Verified',
    description:
      `Your Discord account is already linked, **${displayName}**.\n\n` +
      `**Subscription:** ${subStatus}\n` +
      `**Plan:** ${planId || 'free'}\n` +
      `**Role:** ${roleName}\n\n` +
      'Your roles have been refreshed.',
    color: BRAND_COLOR,
    footer: { text: FOOTER_TEXT },
  };
}

export function accountLinkedEmbed(
  displayName: string,
  subStatus: string,
  planId: string,
  roleName: string,
): APIEmbed {
  return {
    title: 'Account Linked',
    description:
      `Welcome, **${displayName}**! Your Discord account is now linked to RabbitHole.\n\n` +
      `**Subscription:** ${subStatus}\n` +
      `**Plan:** ${planId || 'free'}\n` +
      `**Role:** ${roleName}`,
    color: BRAND_COLOR,
    footer: { text: FOOTER_TEXT },
  };
}
