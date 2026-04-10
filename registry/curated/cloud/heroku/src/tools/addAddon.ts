// @ts-nocheck
/**
 * @fileoverview HerokuAddAddonTool — provision an addon on a Heroku app.
 */

import type { HerokuService, HerokuAddon } from '../HerokuService.js';

export interface HerokuAddAddonInput {
  appName: string;
  plan: string;
  addonName?: string;
  config?: Record<string, string>;
}

export class HerokuAddAddonTool {
  readonly id = 'herokuAddAddon';
  readonly name = 'herokuAddAddon';
  readonly displayName = 'Add Heroku Addon';
  readonly description = 'Provision an addon on a Heroku app. Supports Postgres (heroku-postgresql), Redis (heroku-redis), Papertrail, SendGrid, and hundreds of other marketplace addons. Specify the full plan name (e.g. "heroku-postgresql:essential-0").';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      appName: { type: 'string', description: 'Name of the Heroku app to add the addon to' },
      plan: { type: 'string', description: 'Addon plan identifier (e.g. "heroku-postgresql:essential-0", "heroku-redis:mini", "papertrail:choklad")' },
      addonName: { type: 'string', description: 'Custom name for this addon instance (optional)' },
      config: { type: 'object', description: 'Addon-specific configuration options (key-value pairs)' },
    },
    required: ['appName', 'plan'],
  };

  constructor(private service: HerokuService) {}

  async execute(args: HerokuAddAddonInput): Promise<{ success: boolean; data?: HerokuAddon; error?: string }> {
    try {
      const addon = await this.service.addAddon(args.appName, args.plan, {
        name: args.addonName,
        config: args.config,
      });

      return { success: true, data: addon };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
