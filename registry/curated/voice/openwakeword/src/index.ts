/**
 * @file index.ts
 * @description Pack factory for the OpenWakeWord extension pack.
 *
 * Exports the main {@link createOpenWakeWord} factory function and the
 * {@link createExtensionPack} bridge function that conforms to the AgentOS
 * manifest factory convention.
 *
 * ### Usage (direct)
 * ```ts
 * import { createOpenWakeWord } from '@framers/agentos-ext-openwakeword';
 *
 * const wakeWord = createOpenWakeWord({ modelPath: '/opt/models/hey_mycroft.onnx' });
 * const detection = await wakeWord.detect(frame, 16000);
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-openwakeword" }] }
 * ```
 *
 * @module openwakeword
 */

import { OpenWakeWordProvider } from './OpenWakeWordProvider.js';
import type { OpenWakeWordProviderOptions } from './OpenWakeWordProvider.js';

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
 * Create a standalone {@link OpenWakeWordProvider} instance.
 *
 * @param options - Optional constructor options.
 * @returns Configured {@link OpenWakeWordProvider}.
 */
export function createOpenWakeWord(options?: OpenWakeWordProviderOptions): OpenWakeWordProvider {
  return new OpenWakeWordProvider(options);
}

/**
 * AgentOS manifest factory function.
 *
 * Reads optional configuration from the context `options` map and returns an
 * {@link ExtensionPack} containing a single `wake-word-provider` descriptor
 * backed by {@link OpenWakeWordProvider}.
 *
 * @param context - Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const opts = context.options ?? {};
  const provider = new OpenWakeWordProvider({
    modelPath: opts['modelPath'] as string | undefined,
    threshold: opts['threshold'] as number | undefined,
    keyword: opts['keyword'] as string | undefined,
  });

  return {
    id: 'openwakeword',
    descriptors: [
      {
        id: 'openwakeword',
        kind: EXTENSION_KIND_WAKE_WORD,
        payload: provider,
        enableByDefault: true,
        metadata: { providerId: 'openwakeword' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { OpenWakeWordProvider } from './OpenWakeWordProvider.js';
export type { WakeWordDetection, OpenWakeWordProviderOptions } from './OpenWakeWordProvider.js';
