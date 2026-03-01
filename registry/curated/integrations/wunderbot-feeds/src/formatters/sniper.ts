/**
 * @fileoverview Uniswap sniper embed formatter — ported from bots/sniper_poster.py
 */

import type { DiscordEmbed, SniperEvent } from '../types.js';
import { BRAND_COLOR, SCAM_COLOR, truncate, nowIso, faviconUrl } from './common.js';

/**
 * Format a single Uniswap PairCreated event into an embed.
 */
export function formatSniperEmbed(event: SniperEvent): DiscordEmbed {
  const tokenAddr = event.token?.trim() || '';
  const pairAddr = event.pair?.trim() || '';
  const tokenName = event.token_name?.trim() || '';
  const tokenSymbol = event.token_symbol?.trim() || '';
  const created = event.time?.trim() || '';
  const etherscanToken = event.etherscan_token?.trim() || '';
  const etherscanPair = event.etherscan_pair?.trim() || '';
  const honeypotUrl = event.honeypot_url?.trim() || '';

  // Token label with address
  let tokenLabel = tokenAddr ? `\`${tokenAddr}\`` : 'Unknown';
  if (tokenSymbol) {
    tokenLabel = `**${tokenSymbol}** (${tokenLabel})`;
  } else if (tokenName) {
    tokenLabel = `**${tokenName}** (${tokenLabel})`;
  }

  const title = event.honeypot ? '\u{1f6a8} Honeypot detected' : '\u{1f52b} New Uniswap pair';
  const descrLines: string[] = [`**Token:** ${tokenLabel}`];

  if (tokenName && tokenSymbol) {
    descrLines.push(`**Name:** ${tokenName}`);
  }
  if (pairAddr) {
    descrLines.push(`**Pair:** \`${pairAddr}\``);
  }
  if (created) {
    descrLines.push(`**Created:** ${created}`);
  }

  // Contract verification info (passed through from the API)
  if (event.contract_verified !== undefined) {
    descrLines.push(`**Verified:** ${event.contract_verified ? 'Yes' : 'No'}`);
  }

  // Link buttons as markdown
  const linkParts: string[] = [];
  if (etherscanToken) linkParts.push(`[Etherscan (Token)](${etherscanToken})`);
  if (etherscanPair) linkParts.push(`[Etherscan (Pair)](${etherscanPair})`);
  if (pairAddr) linkParts.push(`[Dexscreener](https://dexscreener.com/ethereum/${pairAddr})`);
  if (honeypotUrl) linkParts.push(`[Honeypot.is](${honeypotUrl})`);
  if (linkParts.length > 0) {
    descrLines.push('');
    descrLines.push(linkParts.join(' \u00b7 '));
  }

  const description = descrLines.join('\n') || 'New Uniswap token detected.';

  const embed: DiscordEmbed = {
    title: truncate(title, 256),
    description: truncate(description, 4096),
    color: event.honeypot ? SCAM_COLOR : BRAND_COLOR,
    timestamp: nowIso(),
    author: { name: '\u{1f52b} Uniswap Sniper' },
    footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
    thumbnail: { url: faviconUrl('uniswap.org') },
  };

  if (etherscanToken) embed.url = etherscanToken;

  return embed;
}
