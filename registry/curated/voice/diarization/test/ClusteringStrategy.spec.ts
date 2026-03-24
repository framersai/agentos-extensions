/**
 * @file ClusteringStrategy.spec.ts
 * @description Unit tests for {@link ClusteringStrategy}.
 */

import { describe, it, expect } from 'vitest';
import { ClusteringStrategy } from '../src/ClusteringStrategy.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function vec(...values: number[]): Float32Array {
  return new Float32Array(values);
}

function makeCentroids(entries: Record<string, number[]>): Map<string, Float32Array> {
  const map = new Map<string, Float32Array>();
  for (const [id, values] of Object.entries(entries)) {
    map.set(id, vec(...values));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClusteringStrategy', () => {
  it('returns empty mapping when all centroids are distinct', () => {
    const strategy = new ClusteringStrategy(0.85);
    const centroids = makeCentroids({
      'Speaker_0': [1, 0, 0, 0],
      'Speaker_1': [0, 1, 0, 0],
      'Speaker_2': [0, 0, 1, 0],
    });
    const mapping = strategy.mergeClusters(centroids);
    expect(mapping.size).toBe(0);
  });

  it('merges closest pair when cosine similarity exceeds threshold', () => {
    const strategy = new ClusteringStrategy(0.85);
    // Speaker_0 and Speaker_1 are nearly identical (sim ≈ 0.9998).
    const centroids = makeCentroids({
      'Speaker_0': [1, 0.01, 0, 0],
      'Speaker_1': [1, 0.02, 0, 0],
      'Speaker_2': [0, 1, 0, 0],      // orthogonal — should not merge
    });
    const mapping = strategy.mergeClusters(centroids);
    expect(mapping.size).toBeGreaterThan(0);
    // Speaker_1 should be merged into Speaker_0 (lexicographic order).
    expect(mapping.get('Speaker_1')).toBe('Speaker_0');
  });

  it('forces merge when count exceeds expectedSpeakers, even below threshold', () => {
    // Use a very high threshold so normal merging never fires.
    const strategy = new ClusteringStrategy(0.9999);
    const centroids = makeCentroids({
      'Speaker_0': [1, 0, 0, 0],
      'Speaker_1': [0, 1, 0, 0],
    });
    // Only 1 speaker expected — force a merge.
    const mapping = strategy.mergeClusters(centroids, 1);
    expect(mapping.size).toBe(1);
  });

  it('does not merge when count equals expectedSpeakers', () => {
    const strategy = new ClusteringStrategy(0.9999);
    const centroids = makeCentroids({
      'Speaker_0': [1, 0, 0, 0],
      'Speaker_1': [0, 1, 0, 0],
    });
    // Exactly 2 speakers expected — no forced merges.
    const mapping = strategy.mergeClusters(centroids, 2);
    expect(mapping.size).toBe(0);
  });

  it('handles single centroid gracefully', () => {
    const strategy = new ClusteringStrategy(0.85);
    const centroids = makeCentroids({ 'Speaker_0': [1, 0, 0, 0] });
    const mapping = strategy.mergeClusters(centroids);
    expect(mapping.size).toBe(0);
  });

  it('handles empty centroid map gracefully', () => {
    const strategy = new ClusteringStrategy(0.85);
    const mapping = strategy.mergeClusters(new Map());
    expect(mapping.size).toBe(0);
  });

  it('produces a transitively resolved rename map', () => {
    // Three speakers, all very similar, with expectedSpeakers=1 to force
    // iterative merging.
    const strategy = new ClusteringStrategy(0.9999);
    const centroids = makeCentroids({
      'Speaker_0': [1, 0, 0, 0],
      'Speaker_1': [0, 1, 0, 0],
      'Speaker_2': [0, 0, 1, 0],
    });
    const mapping = strategy.mergeClusters(centroids, 1);
    // After merging down to 1 speaker, all non-canonical IDs should point to
    // the same canonical ID (no intermediate hops).
    const targets = new Set(mapping.values());
    expect(targets.size).toBe(1);
  });
});
