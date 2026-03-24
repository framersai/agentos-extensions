/**
 * @file ClusteringStrategy.ts
 * @description Agglomerative clustering to merge drifted speaker centroids.
 *
 * Over the course of a long session, a single speaker's vocal characteristics
 * may drift enough that two separate centroids are created for them.
 * {@link ClusteringStrategy.mergeClusters} detects this by computing pairwise
 * cosine similarity between all centroids and iteratively merging the closest
 * pair until either no pair exceeds the merge threshold or the centroid count
 * equals `expectedSpeakers`.
 *
 * @module diarization/ClusteringStrategy
 */

import { cosineSimilarity } from './SpeakerEmbeddingCache.js';

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Agglomerative speaker-centroid merging strategy.
 *
 * This is an optional post-processing step applied by {@link DiarizationSession}
 * when the number of tracked centroids exceeds the expected speaker count.
 *
 * @example
 * ```ts
 * const strategy = new ClusteringStrategy(0.85);
 * const mapping = strategy.mergeClusters(cache.centroids, 2);
 * // mapping: Map<oldId, canonicalId>
 * ```
 */
export class ClusteringStrategy {
  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * @param mergeThreshold - Minimum cosine similarity between two centroids
   *   for them to be considered the same speaker and merged.
   *   @defaultValue 0.85
   */
  constructor(private readonly mergeThreshold: number = 0.85) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Identify centroid pairs that should be merged and return a renaming map.
   *
   * The algorithm:
   * 1. Compute all pairwise cosine similarities.
   * 2. If `expectedSpeakers` is set and the current count exceeds it, merge
   *    the closest pair regardless of the threshold.
   * 3. Otherwise merge pairs that exceed `mergeThreshold`.
   * 4. Repeat until no further merges are possible or the count matches
   *    `expectedSpeakers`.
   *
   * The returned `Map<string, string>` maps every old centroid ID that was
   * subsumed into a canonical ID.  IDs that were not merged are not present in
   * the map.  Callers should rename all occurrences of a key to its value.
   *
   * @param centroids - Current centroid snapshot (id → embedding).
   * @param expectedSpeakers - Optional upper bound on speaker count.
   * @returns Rename map: `oldId → canonicalId`.
   */
  mergeClusters(
    centroids: Map<string, Float32Array>,
    expectedSpeakers?: number,
  ): Map<string, string> {
    // Build a mutable working copy so we can iteratively merge.
    const working = new Map<string, Float32Array>(centroids);
    // Accumulated rename mapping.
    const renameMap = new Map<string, string>();

    while (true) {
      const ids = Array.from(working.keys());
      const count = ids.length;

      // Nothing to merge.
      if (count < 2) break;

      // Find the closest pair.
      let bestSim = -Infinity;
      let bestI = 0;
      let bestJ = 1;

      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const sim = cosineSimilarity(working.get(ids[i]!)!, working.get(ids[j]!)!);
          if (sim > bestSim) {
            bestSim = sim;
            bestI = i;
            bestJ = j;
          }
        }
      }

      // Decide whether to merge.
      const shouldMergeDueToThreshold = bestSim >= this.mergeThreshold;
      const shouldMergeDueToCount =
        expectedSpeakers !== undefined && count > expectedSpeakers;

      if (!shouldMergeDueToThreshold && !shouldMergeDueToCount) break;

      // Merge ids[bestJ] into ids[bestI] (keep the lexicographically earlier
      // ID as the canonical one for determinism).
      const keepId = ids[bestI]!;
      const dropId = ids[bestJ]!;

      // Average the two centroids (equal weight — simple heuristic).
      const keepEmb = working.get(keepId)!;
      const dropEmb = working.get(dropId)!;
      const merged = new Float32Array(keepEmb.length);
      for (let k = 0; k < keepEmb.length; k++) {
        merged[k] = (keepEmb[k]! + dropEmb[k]!) / 2;
      }

      working.set(keepId, merged);
      working.delete(dropId);

      // Record the rename. Chase any existing mappings so the final map is
      // transitively resolved.
      renameMap.set(dropId, keepId);

      // Resolve transitive renames: if dropId was itself a canonical target of
      // an earlier merge, update those entries to point to keepId.
      for (const [old, target] of renameMap) {
        if (target === dropId) {
          renameMap.set(old, keepId);
        }
      }
    }

    return renameMap;
  }
}
