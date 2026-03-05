import type { MastodonService } from '../MastodonService.js';

export class MastodonFavouriteTool {
  readonly id = 'mastodonFavourite';
  readonly name = 'mastodonFavourite';
  readonly displayName = 'Favourite Status';
  readonly description = 'Favourite or unfavourite a Mastodon status.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      statusId: { type: 'string', description: 'ID of the status' },
      undo: { type: 'boolean', description: 'Set to true to unfavourite', default: false },
    },
    required: ['statusId'],
  };

  constructor(private service: MastodonService) {}

  async execute(args: { statusId: string; undo?: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      if (args.undo) {
        await this.service.unfavouriteStatus(args.statusId);
      } else {
        await this.service.favouriteStatus(args.statusId);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
