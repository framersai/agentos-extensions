/**
 * Founders slash command registration and interaction handler.
 *
 * Usage from the Discord adapter:
 *   import { foundersSlashCommands, handleFoundersInteraction } from '@framers/agentos-ext-founders';
 *   // Merge foundersSlashCommands into the commands array
 *   // Call handleFoundersInteraction(interaction) from interactionCreate
 */

export { FOUNDERS_SLASH_COMMANDS } from './definitions.js';
export { createFoundersHandler, type FoundersHandlerConfig } from './handler.js';
