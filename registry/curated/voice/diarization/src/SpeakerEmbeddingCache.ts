/**
 * @file SpeakerEmbeddingCache.ts
 * @description Stores and matches speaker voiceprints using cosine similarity.
 *
 * Each speaker is represented as a running centroid — the mean of all
 * embeddings observed so far.  New audio embeddings are matched against
 * existing centroids; if the best match exceeds the similarity threshold the
 * frame is attributed to that speaker and the centroid is updated.  Otherwise
 * a new `Speaker_N` identity is created.
 *
 * @module diarization/SpeakerEmbeddingCache
 */

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Running centroid entry stored per speaker. */
interface CentroidEntry {
  /** Current mean embedding vector. */
  embedding: Float32Array;
  /** Number of frames that have contributed to this centroid. */
  count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the cosine similarity between two embedding vectors.
 *
 * Returns a value in the range `[-1, 1]`.  A small epsilon is added to the
 * denominator to prevent division-by-zero on silent/zero frames.
 *
 * @param a - First embedding vector.
 * @param b - Second embedding vector.
 * @returns Cosine similarity.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += (a[i]!) ** 2;
    magB += (b[i]!) ** 2;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * In-memory cache of speaker voiceprint centroids.
 *
 * Centroids are updated with an online running-average as new embeddings
 * arrive, so memory usage is O(speakers × embedding dimensions) regardless of
 * the number of frames observed.
 *
 * @example
 * ```ts
 * const cache = new SpeakerEmbeddingCache(0.7);
 * const { speakerId, isNew } = cache.getOrCreateSpeaker(embedding);
 * ```
 */
export class SpeakerEmbeddingCache {
  // -------------------------------------------------------------------------
  // Private state
  // -------------------------------------------------------------------------

  /**
   * Centroid map: `speakerId → { embedding, count }`.
   *
   * Access via {@link centroids} for testing/introspection.
   */
  private readonly _centroids = new Map<string, CentroidEntry>();

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * @param threshold - Minimum cosine similarity required to attribute a new
   *   embedding to an existing speaker.  Embeddings below this threshold
   *   create a new speaker identity.
   *   @defaultValue 0.7
   */
  constructor(private readonly threshold: number = 0.7) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Update the running centroid for `speakerId` with a new embedding.
   *
   * The centroid is recalculated as an online running average:
   * `new_mean = old_mean + (x - old_mean) / (count + 1)`.
   *
   * @param speakerId - Speaker identity to update.
   * @param embedding - New embedding vector to incorporate.
   */
  addEmbedding(speakerId: string, embedding: Float32Array): void {
    const existing = this._centroids.get(speakerId);

    if (!existing) {
      // First frame — store a copy of the embedding directly.
      this._centroids.set(speakerId, {
        embedding: embedding.slice(),
        count: 1,
      });
      return;
    }

    // Online running average: mean_n = mean_{n-1} + (x - mean_{n-1}) / n
    const newCount = existing.count + 1;
    const newEmbedding = new Float32Array(existing.embedding.length);

    for (let i = 0; i < existing.embedding.length; i++) {
      newEmbedding[i] = existing.embedding[i]! + (embedding[i]! - existing.embedding[i]!) / newCount;
    }

    this._centroids.set(speakerId, { embedding: newEmbedding, count: newCount });
  }

  /**
   * Find the existing speaker whose centroid is most similar to `embedding`.
   *
   * Returns `null` if no speaker exceeds the similarity threshold or the cache
   * is empty.
   *
   * @param embedding - Query embedding vector.
   * @returns Best match above threshold, or `null`.
   */
  findClosestSpeaker(embedding: Float32Array): { speakerId: string; similarity: number } | null {
    let bestId: string | null = null;
    let bestSim = -Infinity;

    for (const [id, entry] of this._centroids) {
      const sim = cosineSimilarity(embedding, entry.embedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestId = id;
      }
    }

    if (bestId === null || bestSim < this.threshold) {
      return null;
    }

    return { speakerId: bestId, similarity: bestSim };
  }

  /**
   * Look up or create a speaker identity for `embedding`.
   *
   * If a match above the threshold is found, the centroid is updated and the
   * existing ID is returned.  Otherwise a new `Speaker_N` identity is
   * registered.
   *
   * @param embedding - Audio embedding to resolve.
   * @returns Speaker ID and whether a new identity was created.
   */
  getOrCreateSpeaker(embedding: Float32Array): { speakerId: string; isNew: boolean } {
    const match = this.findClosestSpeaker(embedding);

    if (match) {
      this.addEmbedding(match.speakerId, embedding);
      return { speakerId: match.speakerId, isNew: false };
    }

    const newId = `Speaker_${this._centroids.size}`;
    this.addEmbedding(newId, embedding);
    return { speakerId: newId, isNew: true };
  }

  /**
   * Pre-register a known speaker voiceprint, overwriting any existing centroid
   * for this ID.
   *
   * Use this to seed the cache with enrolment recordings before a session
   * begins so that known participants are matched by name rather than the
   * auto-generated `Speaker_N` label.
   *
   * @param id - Human-readable speaker identifier.
   * @param voiceprint - Reference embedding for this speaker.
   */
  enrollSpeaker(id: string, voiceprint: Float32Array): void {
    this._centroids.set(id, { embedding: voiceprint.slice(), count: 1 });
  }

  // -------------------------------------------------------------------------
  // Accessors (useful for testing and ClusteringStrategy)
  // -------------------------------------------------------------------------

  /**
   * Read-only view of the internal centroid map.
   *
   * Returns a snapshot — modifications to the returned map do not affect the
   * cache.
   */
  get centroids(): Map<string, Float32Array> {
    const result = new Map<string, Float32Array>();
    for (const [id, entry] of this._centroids) {
      result.set(id, entry.embedding.slice());
    }
    return result;
  }

  /** Number of distinct speaker identities currently tracked. */
  get size(): number {
    return this._centroids.size;
  }

  /**
   * Remove all centroids from the cache.
   *
   * Useful for resetting state between test cases.
   */
  clear(): void {
    this._centroids.clear();
  }
}
