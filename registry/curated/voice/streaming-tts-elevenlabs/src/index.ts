/**
 * @file index.ts
 * @description Pack factory for the ElevenLabs Streaming TTS extension pack.
 *
 * Exports the main {@link createElevenLabsStreamingTTS} factory function and the
 * {@link createExtensionPack} bridge function conforming to the AgentOS manifest
 * factory convention.
 *
 * ### Usage (direct)
 * ```ts
 * import { createElevenLabsStreamingTTS } from '@framers/agentos-ext-streaming-tts-elevenlabs';
 *
 * const tts = createElevenLabsStreamingTTS(process.env.ELEVENLABS_API_KEY!);
 * const session = await tts.startSession();
 *
 * session.on('audio_chunk', (chunk) => audioPlayer.enqueue(chunk.audio));
 * llm.on('token', (tok) => session.pushTokens(tok));
 * llm.on('end',   ()    => session.flush());
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-streaming-tts-elevenlabs" }] }
 * ```
 *
 * @module streaming-tts-elevenlabs
 */

import { ElevenLabsStreamingTTS } from './ElevenLabsStreamingTTS.js';
import type { ElevenLabsStreamingTTSConfig } from './types.js';

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
const EXTENSION_KIND_STREAMING_TTS = 'streaming-tts-provider';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Create a standalone {@link ElevenLabsStreamingTTS} instance.
 *
 * Use this when composing the provider programmatically outside of the
 * AgentOS extension system.
 *
 * @param apiKey - ElevenLabs API key.
 * @param options - Optional provider configuration overrides.
 * @returns Configured {@link ElevenLabsStreamingTTS}.
 */
export function createElevenLabsStreamingTTS(
  apiKey: string,
  options?: Omit<ElevenLabsStreamingTTSConfig, 'apiKey'>,
): ElevenLabsStreamingTTS {
  return new ElevenLabsStreamingTTS({ apiKey, ...options });
}

/**
 * AgentOS manifest factory function.
 *
 * Reads the `ELEVENLABS_API_KEY` secret from the context and returns an
 * {@link ExtensionPack} containing a single `streaming-tts-provider`
 * descriptor backed by {@link ElevenLabsStreamingTTS}.
 *
 * Provider-level defaults can be overridden via `context.options`:
 * - `voiceId`        — ElevenLabs voice ID.
 * - `modelId`        — Model ID (default `'eleven_turbo_v2'`).
 * - `stability`      — Voice stability 0.0–1.0.
 * - `similarityBoost`— Similarity boost 0.0–1.0.
 * - `style`          — Style exaggeration 0.0–1.0.
 * - `useSpeakerBoost`— Speaker boost.
 *
 * @param context - Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const apiKey = context.getSecret?.('ELEVENLABS_API_KEY') ?? '';
  const opts   = (context.options ?? {}) as Omit<ElevenLabsStreamingTTSConfig, 'apiKey'>;

  const tts = new ElevenLabsStreamingTTS({ apiKey, ...opts });

  return {
    id: 'streaming-tts-elevenlabs',
    descriptors: [
      {
        id:              'elevenlabs-streaming-tts',
        kind:            EXTENSION_KIND_STREAMING_TTS,
        payload:         tts,
        enableByDefault: true,
        metadata:        { providerId: 'elevenlabs-streaming-tts' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './types.js';
export { ElevenLabsStreamingTTS }  from './ElevenLabsStreamingTTS.js';
export { ElevenLabsTTSSession }    from './ElevenLabsTTSSession.js';
