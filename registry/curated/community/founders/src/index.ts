/**
 * The Founders — Gamified build-in-public extension for AgentOS.
 *
 * Provides:
 * - FounderStore (SQLite data layer with XP, levels, streaks, projects)
 * - 17 Discord slash commands with modals, buttons, embeds
 * - LLM-callable founders_query tool for AI agent integration
 */

import type {
  ExtensionPackContext,
  ExtensionPack,
  ExtensionLifecycleContext,
} from '@framers/agentos';

import { FounderStore } from './store/FounderStore.js';
import { FoundersQueryTool } from './tools/foundersQuery.js';
import { FOUNDERS_SLASH_COMMANDS, createFoundersHandler } from './commands/index.js';

export interface FoundersExtensionOptions {
  dbPath?: string;
  guildId?: string;
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
  proRoles?: Set<string>;
  founderRoleName?: string;
  timezone?: string;
  priority?: number;
}

/** Extended pack with Discord-specific metadata for the Founders extension. */
export interface FoundersExtensionPack extends ExtensionPack {
  metadata: {
    slashCommands: typeof FOUNDERS_SLASH_COMMANDS;
    createHandler: (channelOverrides?: Record<string, string>) => ReturnType<typeof createFoundersHandler>;
  };
}

export function createExtensionPack(context: ExtensionPackContext): FoundersExtensionPack {
  const options = (context.options ?? {}) as FoundersExtensionOptions;

  const dbPath =
    options.dbPath ||
    process.env.RABBITHOLE_DB_PATH ||
    './data/founders.db';

  const guildId =
    options.guildId ||
    process.env.DISCORD_GUILD_ID ||
    '';

  const timezone =
    options.timezone ||
    process.env.RABBITHOLE_TZ ||
    'America/Los_Angeles';

  let store: FounderStore | null = null;

  return {
    name: '@framers/agentos-ext-founders',
    version: '1.0.0',
    descriptors: [
      {
        id: 'founders-query-v1',
        kind: 'tool' as const,
        priority: options.priority ?? 50,
        // Payload is lazy — created on activation.
        get payload() {
          if (!store) throw new Error('Founders extension not activated yet');
          return new FoundersQueryTool(store);
        },
      },
    ],
    onActivate: async (lc?: ExtensionLifecycleContext) => {
      store = new FounderStore(dbPath);
      lc?.logger?.info(`Founders Extension activated — DB: ${dbPath}, Guild: ${guildId}`);
    },
    onDeactivate: async (lc?: ExtensionLifecycleContext) => {
      store?.close();
      store = null;
      lc?.logger?.info('Founders Extension deactivated');
    },

    // ── Custom exports for Discord adapter integration ─────────────────
    // The Discord adapter imports these to register slash commands and handle interactions.
    metadata: {
      /** Slash command definitions to merge into Discord command registration. */
      slashCommands: FOUNDERS_SLASH_COMMANDS,

      /** Factory to create the interaction handler (call after store is ready).
       *  Accepts optional channel overrides from agent.config.json feeds.founders. */
      createHandler: (channelOverrides?: Record<string, string>) => {
        if (!store) throw new Error('Founders extension not activated yet');
        return createFoundersHandler({
          store,
          guildId,
          channels: channelOverrides ?? options.channels,
          proRoles: options.proRoles,
          founderRoleName: options.founderRoleName,
          timezone,
        });
      },
    },
  };
}

// Re-exports.
export { FounderStore } from './store/FounderStore.js';
export type { Founder, FounderProject, FounderCheckin } from './store/FounderStore.js';
export { FoundersQueryTool } from './tools/foundersQuery.js';
export type { FoundersQueryInput, FoundersQueryOutput } from './tools/foundersQuery.js';
export { FOUNDERS_SLASH_COMMANDS } from './commands/index.js';
export { createFoundersHandler } from './commands/index.js';
export type { FoundersHandlerConfig } from './commands/index.js';
export * from './store/xp.js';
export * from './embeds/index.js';
export default createExtensionPack;
