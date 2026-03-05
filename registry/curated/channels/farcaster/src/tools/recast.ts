import type { FarcasterService } from '../FarcasterService.js';

export class FarcasterRecastTool {
  readonly id = 'farcasterRecast';
  readonly name = 'farcasterRecast';
  readonly displayName = 'Recast';
  readonly description = 'Recast (share) a cast on Farcaster.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      castHash: { type: 'string', description: 'Hash of the cast to recast' },
    },
    required: ['castHash'],
  };

  constructor(private service: FarcasterService) {}

  async execute(args: { castHash: string }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.recast(args.castHash);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
