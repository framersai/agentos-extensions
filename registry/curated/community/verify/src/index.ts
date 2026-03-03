/**
 * Verify — Discord account linking extension for AgentOS.
 *
 * Provides:
 * - /verify slash command (links Discord to RabbitHole account)
 * - Persistent "I've verified — check now" button
 * - Automatic role sync based on subscription tier
 */

import type {
  ExtensionPackContext,
  ExtensionPack,
  ExtensionLifecycleContext,
} from '@framers/agentos';

import { VERIFY_SLASH_COMMANDS, createVerifyHandler } from './commands/index.js';

export interface VerifyExtensionOptions {
  /** Restrict /verify to this channel ID. */
  channelId?: string;
  /** RabbitHole backend URL. */
  apiUrl?: string;
  /** Internal secret for the RabbitHole API. */
  apiSecret?: string;
  /** Frontend URL for verification page. */
  frontendUrl?: string;
  /** Role names for subscription tiers. */
  roles?: {
    explorer?: string;
    pioneer?: string;
    enterprise?: string;
    member?: string;
  };
}

export interface VerifyExtensionPack extends ExtensionPack {
  metadata: {
    slashCommands: typeof VERIFY_SLASH_COMMANDS;
    createHandler: (channelOverrides?: { channel_id?: string }) => ReturnType<typeof createVerifyHandler>;
  };
}

export function createExtensionPack(context: ExtensionPackContext): VerifyExtensionPack {
  const options = (context.options ?? {}) as VerifyExtensionOptions;

  return {
    name: '@framers/agentos-ext-verify',
    version: '1.0.0',
    descriptors: [],
    onActivate: async (lc?: ExtensionLifecycleContext) => {
      lc?.logger?.info('Verify Extension activated');
    },
    onDeactivate: async (lc?: ExtensionLifecycleContext) => {
      lc?.logger?.info('Verify Extension deactivated');
    },
    metadata: {
      slashCommands: VERIFY_SLASH_COMMANDS,
      createHandler: (channelOverrides?: { channel_id?: string }) => {
        return createVerifyHandler({
          channelId: channelOverrides?.channel_id || options.channelId,
          apiUrl: options.apiUrl,
          apiSecret: options.apiSecret,
          frontendUrl: options.frontendUrl,
          roles: options.roles,
        });
      },
    },
  };
}

// Re-exports.
export { VERIFY_SLASH_COMMANDS } from './commands/index.js';
export { createVerifyHandler } from './commands/index.js';
export type { VerifyHandlerConfig } from './commands/index.js';
export { VerifyClient } from './api/verifyClient.js';
export type { VerifyTokenResult, VerifyStatusResult } from './api/verifyClient.js';
export default createExtensionPack;
