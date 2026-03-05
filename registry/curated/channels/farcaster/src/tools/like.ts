import type { FarcasterService } from '../FarcasterService.js';

export class FarcasterLikeTool {
  readonly id = 'farcasterLike';
  readonly name = 'farcasterLike';
  readonly displayName = 'Like Cast';
  readonly description = 'Like a cast on Farcaster.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      castHash: { type: 'string', description: 'Hash of the cast to like' },
    },
    required: ['castHash'],
  };

  constructor(private service: FarcasterService) {}

  async execute(args: { castHash: string }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.likeCast(args.castHash);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
