// @ts-nocheck
/**
 * @file index.ts
 * @description Pack factory for the Deepgram Streaming STT extension pack.
 *
 * This module exports the main {@link createDeepgramStreamingSTT} factory
 * function and the {@link createExtensionPack} bridge function that conforms
 * to the AgentOS manifest factory convention.
 *
 * ### Usage (direct)
 * ```ts
 * import { createDeepgramStreamingSTT } from '@framers/agentos-ext-streaming-stt-deepgram';
 *
 * const stt = createDeepgramStreamingSTT(process.env.DEEPGRAM_API_KEY!);
 * const session = await stt.startSession({ language: 'en-US' });
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-streaming-stt-deepgram" }] }
 * ```
 *
 * @module streaming-stt-deepgram
 */

import { DeepgramStreamingSTT } from './DeepgramStreamingSTT.js';

// ---------------------------------------------------------------------------
// Types mirrored locally to avoid a hard runtime dependency on @framers/agentos
// in environments that load this pack before agentos is available.
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

/** Kind constant matching packages/agentos/src/extensions/types.ts line ~410. */
const EXTENSION_KIND_STREAMING_STT = 'streaming-stt-provider';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a standalone {@link DeepgramStreamingSTT} instance.
 *
 * Use this when composing the provider programmatically outside of the
 * AgentOS extension system.
 *
 * @param apiKey - Deepgram API key.
 * @returns Configured {@link DeepgramStreamingSTT}.
 */
export function createDeepgramStreamingSTT(apiKey: string): DeepgramStreamingSTT {
  return new DeepgramStreamingSTT(apiKey);
}

/**
 * AgentOS manifest factory function.
 *
 * Reads the `DEEPGRAM_API_KEY` secret from the context and returns an
 * {@link ExtensionPack} containing a single `streaming-stt-provider`
 * descriptor backed by {@link DeepgramStreamingSTT}.
 *
 * @param context - Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const apiKey = context.getSecret?.('DEEPGRAM_API_KEY') ?? '';
  const stt = new DeepgramStreamingSTT(apiKey);

  return {
    id: 'streaming-stt-deepgram',
    descriptors: [
      {
        id: 'deepgram-streaming-stt',
        kind: EXTENSION_KIND_STREAMING_STT,
        payload: stt,
        enableByDefault: true,
        metadata: { providerId: 'deepgram-streaming' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './types.js';
export { DeepgramStreamingSTT } from './DeepgramStreamingSTT.js';
export { DeepgramStreamSession } from './DeepgramStreamSession.js';
export {
  extractSpeakerFromWords,
  mapDeepgramWord,
} from './DeepgramDiarizationAdapter.js';
export type { DeepgramWord } from './DeepgramDiarizationAdapter.js';
