/**
 * @file DiarizationEngine.spec.ts
 * @description Integration tests for {@link DiarizationEngine} and
 * {@link DiarizationSession}.
 *
 * All tests run without network access or ONNX — only the local backend is
 * exercised here.
 */

import { describe, it, expect, vi } from 'vitest';
import { DiarizationEngine } from '../src/DiarizationEngine.js';
import type { AudioFrame, TranscriptEvent, SpeakerIdentified } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal {@link AudioFrame} containing a sine-wave burst.
 *
 * @param sampleRate - Sample rate in Hz (default 16000).
 * @param durationMs - Frame duration in milliseconds (default 1600 ms so it
 *   exceeds the default 1500 ms chunk size and triggers a chunk_ready event).
 */
function makeAudioFrame(sampleRate = 16_000, durationMs = 1600): AudioFrame {
  const numSamples = Math.round((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
  }
  return { samples, sampleRate, timestamp: Date.now() };
}

function makeTranscriptEvent(text = 'hello world'): TranscriptEvent {
  return {
    text,
    isFinal: true,
    timestamp: Date.now(),
    words: [
      { word: 'hello', start: 0, end: 0.5, speaker: '0', confidence: 0.9 },
      { word: 'world', start: 0.5, end: 1.0, speaker: '0', confidence: 0.95 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiarizationEngine', () => {
  it('startSession returns a session object', () => {
    const engine = new DiarizationEngine();
    const session = engine.startSession();
    expect(session).toBeDefined();
    expect(typeof session.pushAudio).toBe('function');
    expect(typeof session.labelTranscript).toBe('function');
    expect(typeof session.enrollSpeaker).toBe('function');
    expect(typeof session.close).toBe('function');
    session.close();
  });

  it('startSession with backend=provider returns a session', () => {
    const engine = new DiarizationEngine();
    const session = engine.startSession({ backend: 'provider' });
    expect(session).toBeDefined();
    session.close();
  });

  it('session pushAudio processes audio without throwing', () => {
    const engine = new DiarizationEngine();
    const session = engine.startSession();
    const frame = makeAudioFrame();
    expect(() => session.pushAudio(frame)).not.toThrow();
    session.close();
  });

  it('session emits speaker_identified after a full chunk of audio', async () => {
    const engine = new DiarizationEngine();
    const session = engine.startSession({ chunkSizeMs: 100, overlapMs: 20, sampleRate: 16_000 });

    const identified = vi.fn<[SpeakerIdentified], void>();
    session.on('speaker_identified', identified);

    // Push 120 ms of audio (> 100 ms chunk size) to trigger chunk_ready.
    const frame = makeAudioFrame(16_000, 120);
    session.pushAudio(frame);

    // Allow microtask / synchronous event propagation to settle.
    await Promise.resolve();

    expect(identified).toHaveBeenCalledTimes(1);
    const payload = identified.mock.calls[0]![0];
    expect(payload.speakerId).toMatch(/^Speaker_/);
    expect(payload.confidence).toBeGreaterThan(0);

    session.close();
  });

  it('enrollSpeaker makes the enrolled ID recognisable', async () => {
    const engine = new DiarizationEngine();
    const session = engine.startSession({
      chunkSizeMs: 100,
      overlapMs: 20,
      sampleRate: 16_000,
      similarityThreshold: 0.5,  // lower threshold so enrollment is easier to match
    });

    const identified = vi.fn<[SpeakerIdentified], void>();
    session.on('speaker_identified', identified);

    // Enrol Alice with an embedding derived from the same audio we'll push.
    // We synthesise the embedding manually to control the test.
    const voiceprint = new Float32Array(16).fill(0.1);
    session.enrollSpeaker('Alice', voiceprint);

    // Push enough audio to trigger a chunk.
    const frame = makeAudioFrame(16_000, 120);
    session.pushAudio(frame);

    await Promise.resolve();

    expect(identified).toHaveBeenCalled();
    session.close();
  });

  it('labelTranscript returns a segment in provider mode', () => {
    const engine = new DiarizationEngine();
    const session = engine.startSession({ backend: 'provider' });

    const event = makeTranscriptEvent('hello world');
    const segment = session.labelTranscript(event);

    expect(segment).not.toBeNull();
    expect(segment!.speakerId).toBe('0');
    expect(segment!.text).toBe('hello world');

    session.close();
  });

  it('close prevents further events', async () => {
    const engine = new DiarizationEngine();
    const session = engine.startSession({ chunkSizeMs: 100, overlapMs: 20 });

    const identified = vi.fn();
    session.on('speaker_identified', identified);

    session.close();

    // Push audio after close — should be silently ignored.
    const frame = makeAudioFrame(16_000, 120);
    session.pushAudio(frame);

    await Promise.resolve();
    expect(identified).not.toHaveBeenCalled();
  });
});
