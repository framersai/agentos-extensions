/**
 * @file OpenAITTSSession.spec.ts
 * @description Unit tests for {@link OpenAITTSSession}.
 *
 * Global `fetch` is mocked via `vi.stubGlobal` so no real HTTP calls are made.
 * Each test installs a fresh mock that returns a minimal `Response`-like object.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAITTSSession } from '../src/OpenAITTSSession.js';
import type { EncodedAudioChunk } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

/** Minimal fake audio bytes returned by the mock TTS endpoint. */
const FAKE_AUDIO_BYTES = new Uint8Array([0x4f, 0x70, 0x75, 0x73]); // "Opus" bytes

/** The exact ArrayBuffer to return from arrayBuffer() — freshly allocated, no offset. */
const FAKE_AUDIO_BUFFER: ArrayBuffer = FAKE_AUDIO_BYTES.buffer.slice(0);

/** Node.js Buffer equivalent of the fake audio, for equality assertions. */
const FAKE_AUDIO = Buffer.from(FAKE_AUDIO_BUFFER);

/**
 * Build a Response-like object that resolves `arrayBuffer()` to a fresh copy of
 * the fake audio ArrayBuffer.
 *
 * @param ok     - Whether the response should indicate success.
 * @param status - HTTP status code.
 */
function makeFetchResponse(ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(`Error ${status}`),
    arrayBuffer: () => Promise.resolve(FAKE_AUDIO_BUFFER.slice(0)),
  } as unknown as Response;
}

/** Install a mock `fetch` that always returns a successful response. */
function mockFetchOk(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(makeFetchResponse());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Install a mock `fetch` that always returns an error response. */
function mockFetchError(status = 500): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(makeFetchResponse(false, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Install a mock `fetch` that rejects with an AbortError. */
function mockFetchAbort(): ReturnType<typeof vi.fn> {
  const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
  const fetchMock = vi.fn().mockRejectedValue(err);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a session with minimal provider config. */
function makeSession(overrides?: { apiKey?: string; baseUrl?: string; voice?: string; model?: string; format?: string }): OpenAITTSSession {
  return new OpenAITTSSession(
    {
      apiKey:  overrides?.apiKey  ?? 'test-api-key',
      baseUrl: overrides?.baseUrl,
      voice:   overrides?.voice,
      model:   overrides?.model,
      format:  overrides?.format,
    },
    {},
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenAITTSSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. pushTokens forwards to the chunker
  // -------------------------------------------------------------------------

  it('pushTokens with a complete sentence triggers a fetch', async () => {
    const fetchMock = mockFetchOk();
    const session   = makeSession();

    session.pushTokens('Hello world. ');
    await session.flush();

    expect(fetchMock).toHaveBeenCalledOnce();

    session.close();
  });

  // -------------------------------------------------------------------------
  // 2. Fetch target URL and body are correct
  // -------------------------------------------------------------------------

  it('posts to the correct OpenAI TTS endpoint with expected body', async () => {
    const fetchMock = mockFetchOk();
    const session   = makeSession({ baseUrl: 'https://api.openai.com', voice: 'nova', model: 'tts-1', format: 'opus' });

    session.pushTokens('Test sentence. ');
    await session.flush();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe('tts-1');
    expect(body.voice).toBe('nova');
    expect(body.input).toBe('Test sentence.');
    expect(body.response_format).toBe('opus');

    session.close();
  });

  // -------------------------------------------------------------------------
  // 3. Authorization header is set correctly
  // -------------------------------------------------------------------------

  it('includes the Authorization Bearer header in every request', async () => {
    const fetchMock = mockFetchOk();
    const session   = makeSession({ apiKey: 'sk-secret-key' });

    session.pushTokens('Check auth. ');
    await session.flush();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers  = init.headers as Record<string, string>;

    expect(headers['Authorization']).toBe('Bearer sk-secret-key');

    session.close();
  });

  // -------------------------------------------------------------------------
  // 4. audio_chunk is emitted with a Buffer from the response
  // -------------------------------------------------------------------------

  it('emits audio_chunk with a Buffer containing the response bytes', async () => {
    mockFetchOk();
    const session = makeSession();

    const chunks: EncodedAudioChunk[] = [];
    session.on('audio_chunk', (chunk: EncodedAudioChunk) => chunks.push(chunk));

    session.pushTokens('Play this. ');
    await session.flush();

    expect(chunks).toHaveLength(1);
    expect(Buffer.isBuffer(chunks[0]!.audio)).toBe(true);
    expect(chunks[0]!.audio).toEqual(FAKE_AUDIO);
    expect(chunks[0]!.format).toBe('opus');
    expect(chunks[0]!.sampleRate).toBe(24000);

    session.close();
  });

  // -------------------------------------------------------------------------
  // 5. utterance_start and utterance_complete are emitted in order
  // -------------------------------------------------------------------------

  it('emits utterance_start before fetch and utterance_complete after', async () => {
    mockFetchOk();
    const session = makeSession();

    const events: string[] = [];
    session.on('utterance_start',    () => events.push('start'));
    session.on('audio_chunk',        () => events.push('chunk'));
    session.on('utterance_complete', () => events.push('complete'));

    session.pushTokens('Ordered events. ');
    await session.flush();

    // utterance_start fires before the fetch resolves; chunk + complete after.
    expect(events).toEqual(['start', 'chunk', 'complete']);

    session.close();
  });

  // -------------------------------------------------------------------------
  // 6. flush() waits for pending fetches to complete
  // -------------------------------------------------------------------------

  it('flush() resolves only after all pending fetches complete', async () => {
    let resolveAudio!: (buf: ArrayBuffer) => void;
    const audioPromise = new Promise<ArrayBuffer>((res) => (resolveAudio = res));

    const fetchMock = vi.fn().mockResolvedValue({
      ok:          true,
      status:      200,
      arrayBuffer: () => audioPromise,
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession();
    const chunks: EncodedAudioChunk[] = [];
    session.on('audio_chunk', (c: EncodedAudioChunk) => chunks.push(c));

    session.pushTokens('Deferred audio. ');

    // Flush starts waiting — chunk not yet available.
    const flushDone = session.flush();

    // Resolve the deferred audio now.
    resolveAudio(FAKE_AUDIO.buffer);

    await flushDone;
    expect(chunks).toHaveLength(1);

    session.close();
  });

  // -------------------------------------------------------------------------
  // 7. cancel() aborts in-flight requests and emits 'cancelled'
  // -------------------------------------------------------------------------

  it('cancel() aborts in-flight requests and emits cancelled with remaining text', async () => {
    mockFetchAbort();
    const session = makeSession();

    const cancelledEvents: Array<{ remaining: string }> = [];
    session.on('cancelled', (evt: { remaining: string }) => cancelledEvents.push(evt));

    // Push text without a boundary — it stays in the chunker buffer.
    session.pushTokens('This will not be synthesised');
    session.cancel();

    expect(cancelledEvents).toHaveLength(1);
    expect(cancelledEvents[0]!.remaining).toBe('This will not be synthesised');
  });

  // -------------------------------------------------------------------------
  // 8. Error response emits 'error' event and continues pipeline
  // -------------------------------------------------------------------------

  it('emits error event when the API returns a non-ok status', async () => {
    mockFetchError(429);
    const session = makeSession();

    const errors: Error[] = [];
    session.on('error', (err: Error) => errors.push(err));

    session.pushTokens('Rate limited sentence. ');
    await session.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('429');

    session.close();
  });

  // -------------------------------------------------------------------------
  // 9. Multiple sentences are processed in order
  // -------------------------------------------------------------------------

  it('processes multiple sentences and emits audio_chunk in order', async () => {
    mockFetchOk();
    const session = makeSession();

    const texts: string[] = [];
    session.on('audio_chunk', (chunk: EncodedAudioChunk) => texts.push(chunk.text));

    session.pushTokens('First sentence. Second sentence. ');
    await session.flush();

    expect(texts).toEqual(['First sentence.', 'Second sentence.']);

    session.close();
  });

  // -------------------------------------------------------------------------
  // 10. close() suppresses further events
  // -------------------------------------------------------------------------

  it('close() emits close event and suppresses subsequent audio events', async () => {
    mockFetchOk();
    const session = makeSession();

    const closeEvents: number[] = [];
    const chunkEvents: number[] = [];
    session.on('close',       () => closeEvents.push(1));
    session.on('audio_chunk', () => chunkEvents.push(1));

    session.close();

    // Try to push after close — should be silently ignored.
    session.pushTokens('Ignored. ');

    expect(closeEvents).toHaveLength(1);
    // Fetch should not have been triggered (closed before any sentence).
    expect(chunkEvents).toHaveLength(0);
  });
});
