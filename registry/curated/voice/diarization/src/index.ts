/**
 * @file index.ts
 * @description Pack factory for the Diarization extension pack.
 *
 * ### Usage (direct)
 * ```ts
 * import { createDiarizationEngine } from '@framers/agentos-ext-diarization';
 *
 * const engine = createDiarizationEngine();
 * const session = engine.startSession({ backend: 'local' });
 * session.on('speaker_identified', ({ speakerId }) => console.log(speakerId));
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-diarization" }] }
 * ```
 *
 * @module diarization
 */

import { DiarizationEngine } from './DiarizationEngine.js';

// ---------------------------------------------------------------------------
// Local types (avoid hard runtime dep on @framers/agentos)
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
const EXTENSION_KIND_DIARIZATION = 'diarization-provider';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a standalone {@link DiarizationEngine} instance.
 *
 * Use this when composing the engine programmatically outside of the
 * AgentOS extension system.
 *
 * @returns A configured {@link DiarizationEngine}.
 */
export function createDiarizationEngine(): DiarizationEngine {
  return new DiarizationEngine();
}

/**
 * AgentOS manifest factory function.
 *
 * Returns an {@link ExtensionPack} containing a single `diarization-provider`
 * descriptor backed by {@link DiarizationEngine}.
 *
 * @param _context - Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(_context: ExtensionPackContext): ExtensionPack {
  const engine = new DiarizationEngine();

  return {
    id: 'diarization',
    descriptors: [
      {
        id: 'diarization-engine',
        kind: EXTENSION_KIND_DIARIZATION,
        payload: engine,
        enableByDefault: true,
        metadata: { providerId: 'diarization-local' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './types.js';
export { DiarizationEngine } from './DiarizationEngine.js';
export { DiarizationSession } from './DiarizationSession.js';
export { SpeakerEmbeddingCache, cosineSimilarity } from './SpeakerEmbeddingCache.js';
export { ClusteringStrategy } from './ClusteringStrategy.js';
export { SlidingWindowExtractor } from './SlidingWindowExtractor.js';
export { ProviderDiarizationBackend } from './ProviderDiarizationBackend.js';
export { LocalDiarizationBackend } from './LocalDiarizationBackend.js';
