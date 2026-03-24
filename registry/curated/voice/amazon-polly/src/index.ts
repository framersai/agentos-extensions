/**
 * @file index.ts
 * @description Pack factory for the Amazon Polly TTS extension pack.
 *
 * Exports the main {@link createAmazonPollyTTS} factory function and the
 * {@link createExtensionPack} bridge function conforming to the AgentOS
 * manifest factory convention.
 *
 * ### Usage (direct)
 * ```ts
 * import { createAmazonPollyTTS } from '@framers/agentos-ext-amazon-polly';
 *
 * const tts = createAmazonPollyTTS({
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   region: 'us-east-1',
 * });
 * const result = await tts.synthesize('Hello, world!');
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-amazon-polly" }] }
 * ```
 *
 * @module amazon-polly
 */

import { AmazonPollyTTSProvider } from './AmazonPollyTTSProvider.js';
import type { AmazonPollyCredentials } from './AmazonPollyTTSProvider.js';

// ---------------------------------------------------------------------------
// Local interface mirrors — avoids a hard runtime dep on @framers/agentos
// ---------------------------------------------------------------------------

/** Subset of ExtensionDescriptor required by this pack. */
interface ExtensionDescriptor {
  id: string;
  kind: string;
  payload: unknown;
  enableByDefault?: boolean;
  metadata?: Record<string, unknown>;
}

/** Subset of ExtensionPack required by this pack. */
interface ExtensionPack {
  id: string;
  descriptors: ExtensionDescriptor[];
}

/** Subset of ExtensionPackContext required by this pack. */
interface ExtensionPackContext {
  getSecret?: (id: string) => string | undefined;
  options?: Record<string, unknown>;
}

/** Kind constant matching packages/agentos/src/extensions/types.ts. */
const EXTENSION_KIND_TTS = 'tts-provider';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Create a standalone {@link AmazonPollyTTSProvider} instance.
 *
 * @param credentials - AWS credentials and optional region.
 * @returns Configured {@link AmazonPollyTTSProvider}.
 */
export function createAmazonPollyTTS(credentials: AmazonPollyCredentials): AmazonPollyTTSProvider {
  return new AmazonPollyTTSProvider(credentials);
}

/**
 * AgentOS manifest factory function.
 *
 * Reads `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally
 * `AWS_REGION` from the pack context secrets, then returns an
 * {@link ExtensionPack} containing a single `tts-provider` descriptor backed
 * by {@link AmazonPollyTTSProvider}.
 *
 * @param context - Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const provider = new AmazonPollyTTSProvider({
    accessKeyId: context.getSecret?.('AWS_ACCESS_KEY_ID') ?? '',
    secretAccessKey: context.getSecret?.('AWS_SECRET_ACCESS_KEY') ?? '',
    region: context.getSecret?.('AWS_REGION'),
  });

  return {
    id: 'amazon-polly',
    descriptors: [
      {
        id: 'amazon-polly',
        kind: EXTENSION_KIND_TTS,
        payload: provider,
        enableByDefault: true,
        metadata: { providerId: 'amazon-polly' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { AmazonPollyTTSProvider } from './AmazonPollyTTSProvider.js';
export type {
  AmazonPollyCredentials,
  AmazonPollyTTSOptions,
  SpeechVoice,
  SynthesisResult,
} from './AmazonPollyTTSProvider.js';
