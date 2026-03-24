/**
 * @file index.ts
 * @description Pack factory for the Whisper Chunked Streaming STT extension pack.
 *
 * This module exports the main {@link createWhisperChunkedSTT} factory function
 * and the {@link createExtensionPack} bridge function that conforms to the AgentOS
 * manifest factory convention.
 *
 * ### Usage (direct)
 * ```ts
 * import { createWhisperChunkedSTT } from '@framers/agentos-ext-streaming-stt-whisper';
 *
 * const stt = createWhisperChunkedSTT(process.env.OPENAI_API_KEY!);
 * const session = await stt.startSession({ language: 'en' });
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-streaming-stt-whisper" }] }
 * ```
 *
 * @module streaming-stt-whisper
 */

import { WhisperChunkedSTT } from './WhisperChunkedSTT.js';

// ---------------------------------------------------------------------------
// Minimal local mirror of AgentOS extension types to avoid a hard runtime
// dependency on @framers/agentos in environments that load this pack before
// the agentos package is available.
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
const EXTENSION_KIND_STREAMING_STT = 'streaming-stt-provider';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a standalone {@link WhisperChunkedSTT} instance.
 *
 * Use this when composing the provider programmatically outside of the
 * AgentOS extension system.
 *
 * @param apiKey - OpenAI (or compatible) API key.
 * @param baseUrl - Optional API base URL override.
 * @returns Configured {@link WhisperChunkedSTT}.
 */
export function createWhisperChunkedSTT(apiKey: string, baseUrl?: string): WhisperChunkedSTT {
  return new WhisperChunkedSTT(apiKey, baseUrl);
}

/**
 * AgentOS manifest factory function.
 *
 * Reads the `OPENAI_API_KEY` secret from the context and returns an
 * {@link ExtensionPack} containing a single `streaming-stt-provider` descriptor
 * backed by {@link WhisperChunkedSTT}.
 *
 * @param context - Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const apiKey = context.getSecret?.('OPENAI_API_KEY') ?? '';
  const baseUrl = context.options?.['baseUrl'] as string | undefined;
  const stt = new WhisperChunkedSTT(apiKey, baseUrl);

  return {
    id: 'streaming-stt-whisper',
    descriptors: [
      {
        id: 'whisper-chunked-stt',
        kind: EXTENSION_KIND_STREAMING_STT,
        payload: stt,
        enableByDefault: true,
        metadata: { providerId: 'whisper-chunked' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './types.js';
export { WhisperChunkedSTT } from './WhisperChunkedSTT.js';
export { WhisperChunkSession } from './WhisperChunkSession.js';
export { SlidingWindowBuffer } from './SlidingWindowBuffer.js';
export {
  DEFAULT_CHUNK_SIZE_SAMPLES,
  DEFAULT_OVERLAP_SAMPLES,
} from './SlidingWindowBuffer.js';
