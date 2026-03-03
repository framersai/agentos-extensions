/**
 * Slash command JSON definition for /verify.
 */

import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

export const VERIFY_SLASH_COMMANDS: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  {
    name: 'verify',
    description: 'Link your Discord account to RabbitHole',
  },
];
