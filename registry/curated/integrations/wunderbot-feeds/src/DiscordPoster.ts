/**
 * @fileoverview Lightweight Discord REST API poster.
 *
 * Posts embeds directly via the Discord REST API using the bot token.
 * Does NOT require discord.js or a gateway connection — the Discord channel
 * extension handles gateway presence separately.
 */

import type { DiscordEmbed } from './types.js';

const DISCORD_API = 'https://discord.com/api/v10';
const SUPPRESS_NOTIFICATIONS = 1 << 12;

export class DiscordPoster {
  private readonly botToken: string;

  constructor(botToken: string) {
    if (!botToken) throw new Error('DiscordPoster: botToken is required');
    this.botToken = botToken;
  }

  /**
   * Post one or more embeds to a Discord channel.
   * Suppresses push notifications by default.
   */
  async postEmbeds(
    channelId: string,
    embeds: DiscordEmbed[],
    options?: { content?: string; suppressNotifications?: boolean },
  ): Promise<{ id: string }> {
    const payload: Record<string, unknown> = {};
    if (embeds.length > 0) payload.embeds = embeds;
    if (options?.content) payload.content = options.content;
    if (options?.suppressNotifications !== false) {
      payload.flags = SUPPRESS_NOTIFICATIONS;
    }

    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const retry = await res.json().catch(() => ({ retry_after: 5 })) as { retry_after?: number };
      const waitMs = ((retry.retry_after ?? 5) + 0.5) * 1000;
      await sleep(waitMs);
      return this.postEmbeds(channelId, embeds, options);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Discord API ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { id: string };
    return { id: data.id };
  }

  /**
   * Post a debug/status message to a channel.
   */
  async postDebug(channelId: string, message: string): Promise<void> {
    try {
      await this.postEmbeds(channelId, [{
        description: message,
        color: 0x808080,
        timestamp: new Date().toISOString(),
        footer: { text: 'Wunderbot Feeds' },
      }]);
    } catch (e) {
      console.error(`[wunderbot-feeds] Debug post failed: ${e}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
