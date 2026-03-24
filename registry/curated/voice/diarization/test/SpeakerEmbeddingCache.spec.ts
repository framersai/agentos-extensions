/**
 * @file SpeakerEmbeddingCache.spec.ts
 * @description Unit tests for {@link SpeakerEmbeddingCache} and
 * {@link cosineSimilarity}.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SpeakerEmbeddingCache, cosineSimilarity } from '../src/SpeakerEmbeddingCache.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a 4-dimensional Float32Array from plain numbers. */
function vec(...values: number[]): Float32Array {
  return new Float32Array(values);
}

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = vec(1, 0, 0, 0);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = vec(1, 0, 0, 0);
    const b = vec(0, 1, 0, 0);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    const a = vec(1, 0, 0, 0);
    const b = vec(-1, 0, 0, 0);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('handles all-zero vectors without throwing', () => {
    const z = vec(0, 0, 0, 0);
    expect(() => cosineSimilarity(z, z)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SpeakerEmbeddingCache
// ---------------------------------------------------------------------------

describe('SpeakerEmbeddingCache', () => {
  let cache: SpeakerEmbeddingCache;

  beforeEach(() => {
    cache = new SpeakerEmbeddingCache(0.7);
  });

  // -----------------------------------------------------------------------
  // addEmbedding
  // -----------------------------------------------------------------------

  it('addEmbedding stores a new embedding when the speaker is unknown', () => {
    cache.addEmbedding('Alice', vec(1, 0, 0, 0));
    expect(cache.size).toBe(1);
  });

  it('addEmbedding updates the running centroid for an existing speaker', () => {
    cache.addEmbedding('Alice', vec(1, 0, 0, 0));
    cache.addEmbedding('Alice', vec(0, 1, 0, 0));
    // After two observations the centroid should be the mean: [0.5, 0.5, 0, 0]
    const centroids = cache.centroids;
    const alice = centroids.get('Alice')!;
    expect(alice[0]).toBeCloseTo(0.5, 5);
    expect(alice[1]).toBeCloseTo(0.5, 5);
  });

  // -----------------------------------------------------------------------
  // findClosestSpeaker
  // -----------------------------------------------------------------------

  it('findClosestSpeaker returns match above threshold', () => {
    cache.addEmbedding('Alice', vec(1, 0, 0, 0));
    // A very similar vector should match Alice.
    const result = cache.findClosestSpeaker(vec(0.99, 0.01, 0, 0));
    expect(result).not.toBeNull();
    expect(result!.speakerId).toBe('Alice');
    expect(result!.similarity).toBeGreaterThan(0.7);
  });

  it('findClosestSpeaker returns null below threshold', () => {
    cache.addEmbedding('Alice', vec(1, 0, 0, 0));
    // An orthogonal vector should not match (cosine sim = 0).
    const result = cache.findClosestSpeaker(vec(0, 1, 0, 0));
    expect(result).toBeNull();
  });

  it('findClosestSpeaker returns null when cache is empty', () => {
    expect(cache.findClosestSpeaker(vec(1, 0, 0, 0))).toBeNull();
  });

  // -----------------------------------------------------------------------
  // getOrCreateSpeaker
  // -----------------------------------------------------------------------

  it('getOrCreateSpeaker reuses existing speaker above threshold', () => {
    cache.addEmbedding('Speaker_0', vec(1, 0, 0, 0));
    const { speakerId, isNew } = cache.getOrCreateSpeaker(vec(0.99, 0.01, 0, 0));
    expect(speakerId).toBe('Speaker_0');
    expect(isNew).toBe(false);
  });

  it('getOrCreateSpeaker creates new speaker when no match found', () => {
    cache.addEmbedding('Speaker_0', vec(1, 0, 0, 0));
    // Orthogonal embedding → new speaker.
    const { speakerId, isNew } = cache.getOrCreateSpeaker(vec(0, 1, 0, 0));
    expect(speakerId).toBe('Speaker_1');
    expect(isNew).toBe(true);
    expect(cache.size).toBe(2);
  });

  it('getOrCreateSpeaker creates Speaker_0 when cache is empty', () => {
    const { speakerId, isNew } = cache.getOrCreateSpeaker(vec(1, 0, 0, 0));
    expect(speakerId).toBe('Speaker_0');
    expect(isNew).toBe(true);
  });

  // -----------------------------------------------------------------------
  // enrollSpeaker
  // -----------------------------------------------------------------------

  it('enrollSpeaker registers a known voiceprint', () => {
    cache.enrollSpeaker('Alice', vec(1, 0, 0, 0));
    expect(cache.size).toBe(1);

    const result = cache.findClosestSpeaker(vec(0.99, 0.01, 0, 0));
    expect(result).not.toBeNull();
    expect(result!.speakerId).toBe('Alice');
  });

  it('enrollSpeaker overwrites an existing centroid', () => {
    cache.enrollSpeaker('Alice', vec(1, 0, 0, 0));
    // Now enrol a very different voiceprint.
    cache.enrollSpeaker('Alice', vec(0, 0, 0, 1));

    // The original vector should no longer match.
    const result = cache.findClosestSpeaker(vec(1, 0, 0, 0));
    // Cosine similarity is 0, well below threshold 0.7.
    expect(result).toBeNull();
  });
});
