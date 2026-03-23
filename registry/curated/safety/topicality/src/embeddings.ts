/**
 * @file embeddings.ts
 * @description Cosine similarity utility and topic embedding cache for the
 * Topicality guardrail.
 *
 * Provides a lightweight in-memory cache (Map-based) so that topic strings
 * are only embedded once per session, and a pure-function cosine similarity
 * implementation with no external dependencies.
 *
 * @module agentos/extensions/packs/topicality/embeddings
 */

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

/**
 * Compute the cosine similarity between two equal-length numeric vectors.
 *
 * Returns a value in the range [-1, 1] where 1 means identical direction,
 * 0 means orthogonal, and -1 means opposite direction.  If either vector
 * has zero magnitude, returns 0 to avoid division by zero.
 *
 * @param a - First embedding vector.
 * @param b - Second embedding vector (must have the same length as `a`).
 * @returns The cosine similarity score.
 *
 * @example
 * ```typescript
 * const sim = cosineSimilarity([1, 0, 0], [1, 0, 0]);
 * // sim === 1.0
 *
 * const sim2 = cosineSimilarity([1, 0, 0], [0, 1, 0]);
 * // sim2 === 0.0
 * ```
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ---------------------------------------------------------------------------
// Topic embedding cache
// ---------------------------------------------------------------------------

/**
 * Simple in-memory cache mapping topic strings to their embedding vectors.
 *
 * This avoids redundant re-embedding of the same topic string across
 * multiple evaluations within a single session.  The cache is never evicted
 * automatically — call {@link clearEmbeddingCache} on deactivation to
 * release memory.
 *
 * @example
 * ```typescript
 * if (!topicEmbeddingCache.has('billing')) {
 *   const vec = await embed('billing');
 *   topicEmbeddingCache.set('billing', vec);
 * }
 * const cached = topicEmbeddingCache.get('billing')!;
 * ```
 */
export const topicEmbeddingCache: Map<string, number[]> = new Map();

/**
 * Clear all cached topic embeddings.
 *
 * Should be called during pack deactivation or when topic configuration
 * changes to ensure stale embeddings are not reused.
 */
export function clearEmbeddingCache(): void {
  topicEmbeddingCache.clear();
}
