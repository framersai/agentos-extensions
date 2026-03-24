/**
 * @file index.ts
 * @description Pack factory for the Porcupine wake-word extension pack.
 *
 * Exports the main {@link createPorcupine} factory function and the
 * {@link createExtensionPack} bridge function that conforms to the AgentOS
 * manifest factory convention.
 *
 * ### Usage (direct)
 * ```ts
 * import { createPorcupine } from '@framers/agentos-ext-porcupine';
 *
 * const wakeWord = createPorcupine({ accessKey: 'YOUR_KEY', keywords: ['porcupine'] });
 * const detection = await wakeWord.detect(frame, 16000);
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-porcupine" }] }
 * ```
 *
 * @module porcupine
 */

import { PorcupineWakeWordProvider } from './PorcupineWakeWordProvider.js';
import type { PorcupineWakeWordProviderOptions } from './PorcupineWakeWordProvider.js';

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
const EXTENSION_KIND_WAKE_WORD = 'wake-word-provider';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Create a standalone {@link PorcupineWakeWordProvider} instance.
 *
 * @param options - Constructor options (access key required).
 * @returns Configured {@link PorcupineWakeWordProvider}.
 */
export function createPorcupine(
  options: PorcupineWakeWordProviderOptions,
): PorcupineWakeWordProvider {
  return new PorcupineWakeWordProvider(options);
}

/**
 * AgentOS manifest factory function.
 *
 * Reads the `PICOVOICE_ACCESS_KEY` secret and optional keyword configuration
 * from the context, and returns an {@link ExtensionPack} containing a single
 * `wake-word-provider` descriptor.
 *
 * @param context - Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const accessKey = context.getSecret?.('PICOVOICE_ACCESS_KEY') ?? '';
  const opts = context.options ?? {};
  const keywords = opts['keywords'] as string[] | undefined;
  const sensitivities = opts['sensitivities'] as number[] | undefined;

  const provider = new PorcupineWakeWordProvider({ accessKey, keywords, sensitivities });

  return {
    id: 'porcupine',
    descriptors: [
      {
        id: 'porcupine',
        kind: EXTENSION_KIND_WAKE_WORD,
        payload: provider,
        enableByDefault: true,
        metadata: { providerId: 'porcupine' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { PorcupineWakeWordProvider } from './PorcupineWakeWordProvider.js';
export type {
  WakeWordDetection,
  PorcupineWakeWordProviderOptions,
} from './PorcupineWakeWordProvider.js';
