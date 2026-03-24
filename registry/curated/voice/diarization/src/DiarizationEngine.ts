/**
 * @file DiarizationEngine.ts
 * @description Factory that creates {@link DiarizationSession} instances,
 * selecting the appropriate backend based on the supplied configuration.
 *
 * When a provider backend is requested (`config.backend === 'provider'`), the
 * engine creates a {@link ProviderDiarizationBackend} and wraps it in a
 * session.  Otherwise it constructs the full local pipeline:
 * {@link SlidingWindowExtractor} → {@link LocalDiarizationBackend} →
 * {@link SpeakerEmbeddingCache}.
 *
 * @module diarization/DiarizationEngine
 */

import type { IDiarizationEngine, IDiarizationSession, DiarizationConfig } from './types.js';
import { DiarizationSession } from './DiarizationSession.js';
import { SpeakerEmbeddingCache } from './SpeakerEmbeddingCache.js';
import { SlidingWindowExtractor } from './SlidingWindowExtractor.js';
import { LocalDiarizationBackend } from './LocalDiarizationBackend.js';
import { ProviderDiarizationBackend } from './ProviderDiarizationBackend.js';

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_CHUNK_SIZE_MS = 1500;
const DEFAULT_OVERLAP_MS = 500;
const DEFAULT_SAMPLE_RATE = 16_000;

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Factory for diarization sessions.
 *
 * @example
 * ```ts
 * const engine = new DiarizationEngine();
 *
 * // Local mode (default)
 * const session = engine.startSession();
 * session.on('speaker_identified', ({ speakerId }) => console.log(speakerId));
 *
 * // Provider mode
 * const providerSession = engine.startSession({ backend: 'provider' });
 * sttSession.on('transcript', (e) => providerSession.labelTranscript(e));
 * ```
 */
export class DiarizationEngine implements IDiarizationEngine {
  // -------------------------------------------------------------------------
  // IDiarizationEngine implementation
  // -------------------------------------------------------------------------

  /**
   * Create and return a new {@link IDiarizationSession}.
   *
   * The backend is selected based on `config.backend`:
   * - `'provider'` — use {@link ProviderDiarizationBackend}
   * - `'local'` (default) — use {@link LocalDiarizationBackend} with a fresh
   *   {@link SpeakerEmbeddingCache} and {@link SlidingWindowExtractor}
   *
   * @param config - Optional session configuration.
   * @returns A ready-to-use {@link DiarizationSession}.
   */
  startSession(config: DiarizationConfig = {}): IDiarizationSession {
    const backend = config.backend ?? 'local';

    if (backend === 'provider') {
      return new DiarizationSession({
        kind: 'provider',
        backend: new ProviderDiarizationBackend(),
      });
    }

    // Local mode — wire up the full pipeline.
    const threshold = config.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
    const chunkSizeMs = config.chunkSizeMs ?? DEFAULT_CHUNK_SIZE_MS;
    const overlapMs = config.overlapMs ?? DEFAULT_OVERLAP_MS;
    const sampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;

    const cache = new SpeakerEmbeddingCache(threshold);
    const extractor = new SlidingWindowExtractor(chunkSizeMs, overlapMs, sampleRate);
    const localBackend = new LocalDiarizationBackend(cache, extractor);

    return new DiarizationSession({
      kind: 'local',
      backend: localBackend,
      cache,
      extractor,
    });
  }
}
