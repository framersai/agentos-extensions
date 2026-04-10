// @ts-nocheck
/**
 * @file index.ts
 * @description Pack factory for the Piper TTS extension pack.
 *
 * Exports the main {@link createPiperTTS} factory function and the
 * {@link createExtensionPack} bridge function that conforms to the AgentOS
 * manifest factory convention.
 *
 * ### Usage (direct)
 * ```ts
 * import { createPiperTTS } from '@framers/agentos-ext-piper';
 *
 * const tts = createPiperTTS({ modelPath: '/opt/piper/en_US-lessac-medium.onnx' });
 * const { audioBuffer } = await tts.synthesize('Hello world');
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-piper" }] }
 * ```
 *
 * @module piper
 */

import { PiperTTSProvider } from './PiperTTSProvider.js';
import type { PiperTTSProviderOptions } from './PiperTTSProvider.js';

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
 * Create a standalone {@link PiperTTSProvider} instance.
 *
 * @param options - Optional constructor options.
 * @returns Configured {@link PiperTTSProvider}.
 */
export function createPiperTTS(options?: PiperTTSProviderOptions): PiperTTSProvider {
  return new PiperTTSProvider(options);
}

/**
 * AgentOS manifest factory function.
 *
 * Reads optional configuration from the context `options` map and returns an
 * {@link ExtensionPack} containing a single `tts-provider` descriptor backed
 * by {@link PiperTTSProvider}.
 *
 * @param context - Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const opts = context.options ?? {};
  const provider = new PiperTTSProvider({
    binaryPath: opts['binaryPath'] as string | undefined,
    modelPath: opts['modelPath'] as string | undefined,
    maxBufferBytes: opts['maxBufferBytes'] as number | undefined,
    timeoutMs: opts['timeoutMs'] as number | undefined,
  });

  return {
    id: 'piper',
    descriptors: [
      {
        id: 'piper',
        kind: EXTENSION_KIND_TTS,
        payload: provider,
        enableByDefault: true,
        metadata: { providerId: 'piper' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { PiperTTSProvider } from './PiperTTSProvider.js';
export type { SynthesisResult, PiperTTSProviderOptions } from './PiperTTSProvider.js';
