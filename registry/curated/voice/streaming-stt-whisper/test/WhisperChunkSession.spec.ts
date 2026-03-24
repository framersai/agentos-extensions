/**
 * @file WhisperChunkSession.spec.ts
 * @description Unit tests for {@link WhisperChunkSession}.
 *
 * The global `fetch` function is mocked via `vi.stubGlobal` so tests run
 * without a network connection or a real API key.  The mock captures every
 * call and allows per-test response configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhisperChunkSession } from '../src/WhisperChunkSession.js';
import type { WhisperTranscriptionResponse } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------

/** The mock fetch function used across all tests. */
let mockFetch: ReturnType<typeof vi.fn>;

/** Captured calls to the mocked fetch. */
type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[];

/** Default successful Whisper response. */
const DEFAULT_WHISPER_RESPONSE: WhisperTranscriptionResponse = {
  task: 'transcribe',
  language: 'english',
  duration: 1.0,
  text: ' Hello world',
  segments: [
    {
      id: 0,
      start: 0.0,
      end: 1.0,
      text: ' Hello world',
      avg_logprob: -0.3,
      words: [
        { word: ' Hello', start: 0.0, end: 0.5 },
        { word: ' world', start: 0.5, end: 1.0 },
      ],
    },
  ],
};

function makeJsonResponse(body: WhisperTranscriptionResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchCalls = [];
  mockFetch = vi.fn(async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return makeJsonResponse(DEFAULT_WHISPER_RESPONSE);
  });
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal AudioFrame with the given number of samples. */
function makeFrame(
  numSamples: number,
  value = 0.5,
): { samples: Float32Array; sampleRate: number; timestamp: number } {
  return {
    samples: new Float32Array(numSamples).fill(value),
    sampleRate: 16_000,
    timestamp: Date.now(),
  };
}

/** Build a silent frame (all zeros). */
function silentFrame(numSamples: number) {
  return makeFrame(numSamples, 0);
}

/** Wait one microtask tick for async handlers to settle. */
function tick(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WhisperChunkSession', () => {
  // 1. pushAudio forwards samples to the sliding buffer
  it('pushAudio accumulates samples and triggers fetch when chunk is full', async () => {
    // chunkSize=16 for test speed
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 16,
      overlapSamples: 4,
    });

    // Push exactly one chunk worth of samples.
    session.pushAudio(makeFrame(16));
    await tick();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    session.close();
  });

  it('pushAudio does not trigger fetch when chunk is not full', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 16,
      overlapSamples: 4,
    });

    session.pushAudio(makeFrame(8)); // only half
    await tick();

    expect(mockFetch).not.toHaveBeenCalled();
    session.close();
  });

  // 2. Fetch is called with correct URL and multipart body
  it('posts to the correct Whisper endpoint URL', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com',
      model: 'whisper-1',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    session.pushAudio(makeFrame(8));
    await tick();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe('https://api.openai.com/v1/audio/transcriptions');
    session.close();
  });

  it('includes Authorization header with Bearer token', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'my-secret-key',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    session.pushAudio(makeFrame(8));
    await tick();

    const headers = fetchCalls[0]!.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-secret-key');
    session.close();
  });

  it('sends a FormData body containing a WAV file and model field', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      model: 'whisper-1',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    session.pushAudio(makeFrame(8));
    await tick();

    const body = fetchCalls[0]!.init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('model')).toBe('whisper-1');
    expect(body.get('response_format')).toBe('verbose_json');
    expect(body.get('file')).toBeInstanceOf(Blob);
    session.close();
  });

  // 3. Parses Whisper response into TranscriptEvent
  it('emits interim_transcript with text and words from Whisper response', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    const handler = vi.fn();
    session.on('interim_transcript', handler);

    session.pushAudio(makeFrame(8));
    await tick();

    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0]![0];
    expect(evt.text).toBe('Hello world');
    expect(evt.isFinal).toBe(false);
    expect(evt.words).toHaveLength(2);
    expect(evt.words[0].word).toBe('Hello');
    expect(evt.words[1].word).toBe('world');
    session.close();
  });

  it('maps avg_logprob to a confidence value in [0, 1]', async () => {
    // avg_logprob=-0.3 → exp(-0.3) ≈ 0.74
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    const handler = vi.fn();
    session.on('interim_transcript', handler);

    session.pushAudio(makeFrame(8));
    await tick();

    const evt = handler.mock.calls[0]![0];
    expect(evt.confidence).toBeGreaterThan(0);
    expect(evt.confidence).toBeLessThanOrEqual(1);
    session.close();
  });

  // 4. Previous transcript used as prompt for continuity
  it('sends prompt of initial config for first chunk', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      prompt: 'AgentOS voice assistant',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    session.pushAudio(makeFrame(8));
    await tick();

    const body = fetchCalls[0]!.init.body as FormData;
    expect(body.get('prompt')).toBe('AgentOS voice assistant');
    session.close();
  });

  it('uses the previous chunk transcript as prompt for subsequent chunks', async () => {
    // Override mockFetch to record calls AND return appropriate responses.
    // We cannot use mockResolvedValueOnce here because it bypasses the
    // function body that populates fetchCalls.
    let callCount = 0;
    mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
      fetchCalls.push({ url, init });
      callCount++;
      const text = callCount === 1 ? ' Hello world' : ' How are you';
      return makeJsonResponse({ ...DEFAULT_WHISPER_RESPONSE, text });
    });

    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    // First chunk
    session.pushAudio(makeFrame(8));
    await tick();

    // Second chunk — buffer starts at overlapSamples(2), needs 6 more to fill
    session.pushAudio(makeFrame(6));
    await tick();

    expect(fetchCalls).toHaveLength(2);
    const secondBody = fetchCalls[1]!.init.body as FormData;
    expect(secondBody.get('prompt')).toBe('Hello world');
    session.close();
  });

  // 5. flush() sends final chunk and emits final_transcript
  it('flush() emits final_transcript after processing remaining audio', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 16,
      overlapSamples: 4,
    });

    const finalHandler = vi.fn();
    session.on('final_transcript', finalHandler);

    // Push partial audio (not a full chunk)
    session.pushAudio(makeFrame(8));
    await tick();

    await session.flush();

    expect(finalHandler).toHaveBeenCalledTimes(1);
    const evt = finalHandler.mock.calls[0]![0];
    expect(evt.isFinal).toBe(true);
    session.close();
  });

  it('flush() triggers a fetch for any remaining buffered samples', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 16,
      overlapSamples: 4,
    });

    // Push 5 samples (less than chunkSize) — no fetch yet
    session.pushAudio(makeFrame(5));
    await tick();
    expect(mockFetch).not.toHaveBeenCalled();

    await session.flush();
    // flush() triggers the SlidingWindowBuffer.flush() which emits chunk_ready
    await tick();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    session.close();
  });

  // 6. speech_start and speech_end based on audio energy
  it('emits speech_start when RMS energy crosses threshold', () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 16,
      overlapSamples: 4,
    });

    const handler = vi.fn();
    session.on('speech_start', handler);

    // Amplitude 0.5 → RMS 0.5 > threshold 0.01
    session.pushAudio(makeFrame(4, 0.5));

    expect(handler).toHaveBeenCalledTimes(1);
    session.close();
  });

  it('emits speech_end when RMS energy falls back below threshold', () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 16,
      overlapSamples: 4,
    });

    const startHandler = vi.fn();
    const endHandler = vi.fn();
    session.on('speech_start', startHandler);
    session.on('speech_end', endHandler);

    // Loud frame → speech_start
    session.pushAudio(makeFrame(4, 0.5));
    expect(startHandler).toHaveBeenCalledTimes(1);
    expect(endHandler).not.toHaveBeenCalled();

    // Silent frame → speech_end
    session.pushAudio(silentFrame(4));
    expect(endHandler).toHaveBeenCalledTimes(1);

    session.close();
  });

  it('does not emit speech_start for silent frames', () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 16,
      overlapSamples: 4,
    });

    const handler = vi.fn();
    session.on('speech_start', handler);

    session.pushAudio(silentFrame(8));
    expect(handler).not.toHaveBeenCalled();
    session.close();
  });

  it('emits speech_start only once per continuous speech segment', () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 16,
      overlapSamples: 4,
    });

    const handler = vi.fn();
    session.on('speech_start', handler);

    session.pushAudio(makeFrame(4, 0.5)); // starts speech
    session.pushAudio(makeFrame(4, 0.3)); // still in speech — no new event
    session.pushAudio(makeFrame(4, 0.6)); // still in speech — no new event

    expect(handler).toHaveBeenCalledTimes(1);
    session.close();
  });

  // 7. Error handling — fetch failure emits error event, session continues
  it('emits error event when fetch fails and does not crash the session', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    const errorHandler = vi.fn();
    const interimHandler = vi.fn();
    session.on('error', errorHandler);
    session.on('interim_transcript', interimHandler);

    session.pushAudio(makeFrame(8));
    await tick();

    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect(interimHandler).not.toHaveBeenCalled(); // no partial result

    // Session is still usable — push another chunk (this one succeeds)
    session.pushAudio(makeFrame(6)); // 2 overlap + 6 = 8 → new chunk
    await tick();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(interimHandler).toHaveBeenCalledTimes(1); // second chunk succeeded
    session.close();
  });

  it('emits error event when Whisper returns a non-2xx status', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Rate limit exceeded', { status: 429 }),
    );

    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    const errorHandler = vi.fn();
    session.on('error', errorHandler);

    session.pushAudio(makeFrame(8));
    await tick();

    expect(errorHandler).toHaveBeenCalledTimes(1);
    const err = errorHandler.mock.calls[0]![0] as Error;
    expect(err.message).toContain('429');
    session.close();
  });

  // 8. close() stops processing
  it('close() emits close event and ignores subsequent pushAudio calls', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    const closeHandler = vi.fn();
    session.on('close', closeHandler);

    session.close();
    expect(closeHandler).toHaveBeenCalledTimes(1);

    // pushAudio after close should be ignored
    session.pushAudio(makeFrame(8));
    await tick();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 9. language and model passed to API
  it('includes language in the form body when configured', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      language: 'fr',
      chunkSizeSamples: 8,
      overlapSamples: 2,
    });

    session.pushAudio(makeFrame(8));
    await tick();

    const body = fetchCalls[0]!.init.body as FormData;
    expect(body.get('language')).toBe('fr');
    session.close();
  });

  it('does not include language field when language is not configured', async () => {
    const session = new WhisperChunkSession({
      apiKey: 'sk-test',
      chunkSizeSamples: 8,
      overlapSamples: 2,
      // language intentionally omitted
    });

    session.pushAudio(makeFrame(8));
    await tick();

    const body = fetchCalls[0]!.init.body as FormData;
    expect(body.get('language')).toBeNull();
    session.close();
  });
});
