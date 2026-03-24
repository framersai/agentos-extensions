/**
 * @file index.ts
 * @description Pack factory for the Vosk STT extension pack.
 *
 * Exports the main {@link createVoskSTT} factory function and the
 * {@link createExtensionPack} bridge function that conforms to the AgentOS
 * manifest factory convention.
 *
 * ### Usage (direct)
 * ```ts
 * import { createVoskSTT } from '@framers/agentos-ext-vosk';
 *
 * const stt = createVoskSTT({ modelPath: '/opt/models/vosk-en' });
 * const results = await stt.transcribe({ data: pcmBuffer });
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-vosk" }] }
 * ```
 *
 * @module vosk
 */

import { VoskSTTProvider } from './VoskSTTProvider.js';
import type { VoskSTTOptions } from './VoskSTTProvider.js';

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
const EXTENSION_KIND_STT = 'stt-provider';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Create a standalone {@link VoskSTTProvider} instance.
 *
 * Use this when composing the provider programmatically outside of the
 * AgentOS extension system.
 *
 * @param options - Optional constructor options (model path).
 * @returns Configured {@link VoskSTTProvider}.
 */
export function createVoskSTT(options?: VoskSTTOptions): VoskSTTProvider {
  return new VoskSTTProvider(options);
}

/**
 * AgentOS manifest factory function.
 *
 * Reads the optional `VOSK_MODEL_PATH` option from the context and returns an
 * {@link ExtensionPack} containing a single `stt-provider` descriptor backed
 * by {@link VoskSTTProvider}.
 *
 * @param context - Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const modelPath = (context.options?.['modelPath'] as string | undefined) ?? undefined;
  const provider = new VoskSTTProvider({ modelPath });

  return {
    id: 'vosk',
    descriptors: [
      {
        id: 'vosk',
        kind: EXTENSION_KIND_STT,
        payload: provider,
        enableByDefault: true,
        metadata: { providerId: 'vosk' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { VoskSTTProvider } from './VoskSTTProvider.js';
export { _resetModelSingleton, _getModelSingleton, _getResolvedModelPath } from './VoskSTTProvider.js';
export type { SpeechTranscriptionResult, AudioData, VoskSTTOptions } from './VoskSTTProvider.js';
