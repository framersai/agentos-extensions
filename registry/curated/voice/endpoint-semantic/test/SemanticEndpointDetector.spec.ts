// @ts-nocheck
/**
 * @file SemanticEndpointDetector.spec.ts
 * @description Unit tests for {@link SemanticEndpointDetector}.
 *
 * Timer-dependent tests use a short `silenceTimeoutMs` (100 ms) to keep CI
 * execution fast while remaining deterministic.  The LLM is always a
 * controlled stub — no real network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SemanticEndpointDetector } from '../src/SemanticEndpointDetector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal final transcript object. */
function transcript(text: string, isFinal = true, confidence = 0.9) {
  return { text, confidence, words: [], isFinal };
}

/** Build a speech_end VAD event at the current time. */
function speechEnd(timestamp = Date.now()) {
  return { type: 'speech_end' as const, timestamp, source: 'vad' as const };
}

/** Build a speech_start VAD event at the current time. */
function speechStart(timestamp = Date.now()) {
  return { type: 'speech_start' as const, timestamp, source: 'vad' as const };
}

/**
 * Create a detector with a controlled LLM stub.
 *
 * @param llmResponse          — String the LLM resolves with.
 * @param llmDelayMs           — Artificial delay in ms for the LLM call.
 * @param minSilenceBeforeCheck — Delay before the LLM is invoked (ms).
 * @param silenceTimeoutMs     — Hard silence fallback (ms).
 */
function makeDetector(
  llmResponse: string,
  llmDelayMs = 0,
  minSilenceBeforeCheck = 50,
  silenceTimeoutMs = 150,
) {
  const llmCall = vi.fn(
    (_prompt: string) =>
      new Promise<string>((resolve) => setTimeout(() => resolve(llmResponse), llmDelayMs)),
  );

  const detector = new SemanticEndpointDetector(llmCall, {
    timeoutMs: 200,
    minSilenceBeforeCheckMs: minSilenceBeforeCheck,
    silenceTimeoutMs,
  });

  return { detector, llmCall };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SemanticEndpointDetector', () => {
  let detector: SemanticEndpointDetector;

  beforeEach(() => {
    detector = makeDetector('INCOMPLETE').detector;
  });

  afterEach(() => {
    detector.reset();
  });

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  it('mode is "semantic"', () => {
    expect(detector.mode).toBe('semantic');
  });

  // -------------------------------------------------------------------------
  // Punctuation — immediate fire (same as heuristic)
  // -------------------------------------------------------------------------

  it('emits turn_complete immediately with reason "punctuation" when text ends with period', () => {
    const handler = vi.fn();
    detector.on('turn_complete', handler);

    detector.pushTranscript(transcript('Tell me about the project.'));
    detector.pushVadEvent(speechEnd());

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].reason).toBe('punctuation');
    expect(handler.mock.calls[0][0].transcript).toBe('Tell me about the project.');
  });

  it('emits turn_complete immediately with reason "punctuation" on question mark', () => {
    const handler = vi.fn();
    detector.on('turn_complete', handler);

    detector.pushTranscript(transcript('What time is it?'));
    detector.pushVadEvent(speechEnd());

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].reason).toBe('punctuation');
  });

  it('emits turn_complete immediately with reason "punctuation" on exclamation mark', () => {
    const handler = vi.fn();
    detector.on('turn_complete', handler);

    detector.pushTranscript(transcript('Watch out!'));
    detector.pushVadEvent(speechEnd());

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].reason).toBe('punctuation');
  });

  // -------------------------------------------------------------------------
  // Backchannel detection
  // -------------------------------------------------------------------------

  it('detects backchannel "uh huh" and suppresses turn_complete', () => {
    const bcHandler = vi.fn();
    const tcHandler = vi.fn();
    detector.on('backchannel_detected', bcHandler);
    detector.on('turn_complete', tcHandler);

    detector.pushTranscript(transcript('uh huh'));
    detector.pushVadEvent(speechEnd());

    expect(bcHandler).toHaveBeenCalledOnce();
    expect(bcHandler.mock.calls[0][0].text).toBe('uh huh');
    expect(tcHandler).not.toHaveBeenCalled();
  });

  it('detects backchannel "yeah" and suppresses turn_complete', () => {
    const bcHandler = vi.fn();
    const tcHandler = vi.fn();
    detector.on('backchannel_detected', bcHandler);
    detector.on('turn_complete', tcHandler);

    detector.pushTranscript(transcript('yeah'));
    detector.pushVadEvent(speechEnd());

    expect(bcHandler).toHaveBeenCalledOnce();
    expect(tcHandler).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Ambiguous text — LLM invoked on silence
  // -------------------------------------------------------------------------

  it('calls classifier when text has no terminal punctuation and silence passes', async () => {
    const { detector: det, llmCall } = makeDetector('INCOMPLETE', 0, 50, 300);
    det.on('turn_complete', vi.fn());

    det.pushTranscript(transcript('I was thinking about'));
    det.pushVadEvent(speechEnd());

    // LLM should not be called synchronously — it waits for minSilenceBeforeCheckMs.
    expect(llmCall).not.toHaveBeenCalled();

    // Wait past the minSilenceBeforeCheckMs (50 ms).
    await new Promise<void>((r) => setTimeout(r, 80));

    expect(llmCall).toHaveBeenCalledOnce();

    det.reset();
  });

  // -------------------------------------------------------------------------
  // Classifier returns COMPLETE → semantic_model reason
  // -------------------------------------------------------------------------

  it('emits turn_complete with reason "semantic_model" when classifier returns COMPLETE', async () => {
    // LLM responds COMPLETE quickly; minSilenceBeforeCheck=50ms, silenceTimeout=300ms
    const { detector: det } = makeDetector('COMPLETE Yes, it is complete.', 0, 50, 300);
    const handler = vi.fn();
    det.on('turn_complete', handler);

    det.pushTranscript(transcript('I need help with the deployment pipeline'));
    det.pushVadEvent(speechEnd());

    // Wait past minSilenceBeforeCheck + LLM delay.
    await new Promise<void>((r) => setTimeout(r, 120));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].reason).toBe('semantic_model');
    expect(handler.mock.calls[0][0].transcript).toBe(
      'I need help with the deployment pipeline',
    );
  });

  // -------------------------------------------------------------------------
  // Classifier returns INCOMPLETE → no immediate emit
  // -------------------------------------------------------------------------

  it('does not emit turn_complete immediately when classifier returns INCOMPLETE', async () => {
    // LLM: INCOMPLETE quickly; minSilenceBeforeCheck=50ms; hard timeout=300ms
    const { detector: det } = makeDetector('INCOMPLETE Still mid-sentence.', 0, 50, 300);
    const handler = vi.fn();
    det.on('turn_complete', handler);

    det.pushTranscript(transcript('I was going to say that maybe'));
    det.pushVadEvent(speechEnd());

    // Wait past LLM check but before the hard silence timeout.
    await new Promise<void>((r) => setTimeout(r, 120));

    // LLM said INCOMPLETE — turn should NOT have fired yet.
    expect(handler).not.toHaveBeenCalled();

    det.reset();
  });

  // -------------------------------------------------------------------------
  // Classifier times out → silence_timeout fallback
  // -------------------------------------------------------------------------

  it('falls back to silence_timeout when classifier times out', async () => {
    // LLM takes 300 ms; classifier timeoutMs=200 ms → TIMEOUT.
    // minSilenceBeforeCheck=50ms; silenceTimeout=200ms.
    const llmCall = vi.fn(
      (_prompt: string) =>
        new Promise<string>((resolve) => setTimeout(() => resolve('COMPLETE Late.'), 300)),
    );

    const det = new SemanticEndpointDetector(llmCall, {
      timeoutMs: 200,
      minSilenceBeforeCheckMs: 50,
      silenceTimeoutMs: 200,
    });

    const handler = vi.fn();
    det.on('turn_complete', handler);

    det.pushTranscript(transcript('Well I think the solution might'));
    det.pushVadEvent(speechEnd());

    // Wait past the hard silence timeout (200 ms) + some buffer.
    await new Promise<void>((r) => setTimeout(r, 300));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].reason).toBe('silence_timeout');

    det.reset();
  });
});
