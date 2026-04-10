// @ts-nocheck
/**
 * @file index.ts
 * @description Pack factory for the OpenAI Streaming TTS extension pack.
 *
 * Exports the main {@link createOpenAIStreamingTTS} factory function and the
 * {@link createExtensionPack} bridge function conforming to the AgentOS
 * manifest factory convention.
 *
 * ### Usage (direct)
 * ```ts
 * import { createOpenAIStreamingTTS } from '@framers/agentos-ext-streaming-tts-openai';
 *
 * const tts = createOpenAIStreamingTTS(process.env.OPENAI_API_KEY!);
 * const session = await tts.startSession();
 *
 * session.on('audio_chunk', (chunk) => audioPlayer.enqueue(chunk.audio));
 * llm.on('token', (tok) => session.pushTokens(tok));
 * llm.on('end',   ()    => session.flush());
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-streaming-tts-openai" }] }
 * ```
 *
 * @module streaming-tts-openai
 */

import { OpenAIStreamingTTS } from './OpenAIStreamingTTS.js';

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
 * Create a standalone {@link OpenAIStreamingTTS} instance.
 *
 * Use this when composing the provider programmatically outside of the
 * AgentOS extension system.
 *
 * @param apiKey - OpenAI API key.
 * @param options - Optional provider configuration overrides.
 * @returns Configured {@link OpenAIStreamingTTS}.
 */
export function createOpenAIStreamingTTS(
  apiKey: string,
  options?: { model?: string; voice?: string; format?: string; baseUrl?: string; maxBufferMs?: number },
): OpenAIStreamingTTS {
  return new OpenAIStreamingTTS({ apiKey, ...options });
}

/**
 * AgentOS manifest factory function.
 *
 * Reads the `OPENAI_API_KEY` secret from the context and returns an
 * {@link ExtensionPack} containing a single `streaming-tts-provider`
 * descriptor backed by {@link OpenAIStreamingTTS}.
 *
 * Provider-level defaults can be overridden via `context.options`:
 * - `model`       — TTS model (default `'tts-1'`).
 * - `voice`       — Voice preset (default `'nova'`).
 * - `format`      — Output format (default `'opus'`).
 * - `maxBufferMs` — Sentence flush timer ms (default `2000`).
 *
 * @param context - Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const apiKey  = context.getSecret?.('OPENAI_API_KEY') ?? '';
  const opts    = (context.options ?? {}) as {
    model?: string;
    voice?: string;
    format?: string;
    baseUrl?: string;
    maxBufferMs?: number;
  };

  const tts = new OpenAIStreamingTTS({ apiKey, ...opts });

  return {
    id: 'streaming-tts-openai',
    descriptors: [
      {
        id:              'openai-streaming-tts',
        kind:            EXTENSION_KIND_STREAMING_TTS,
        payload:         tts,
        enableByDefault: true,
        metadata:        { providerId: 'openai-streaming-tts' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './types.js';
export { OpenAIStreamingTTS }          from './OpenAIStreamingTTS.js';
export { OpenAITTSSession }            from './OpenAITTSSession.js';
export { AdaptiveSentenceChunker }     from './AdaptiveSentenceChunker.js';
