// @ts-nocheck
/**
 * @file ElevenLabsTTSSession.spec.ts
 * @description Unit tests for {@link ElevenLabsTTSSession}.
 *
 * The `ws` module is mocked via `vi.mock` so no real WebSocket connections
 * are opened.  Each test controls the mock WebSocket's behaviour directly via
 * a module-level singleton that is reset between tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

// vi.mock is hoisted to the top of the file by Vitest. The factory must not
// reference any variables declared in the outer module scope that are not yet
// initialised.  To avoid this we use a simple hand-rolled EventEmitter that
// only depends on built-in language features.

vi.mock('ws', () => {
  // Minimal built-in EventEmitter replacement (no external imports needed).
  class SimpleEmitter {
    private _handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

    on(event: string, fn: (...args: unknown[]) => void): this {
      (this._handlers[event] ??= []).push(fn);
      return this;
    }

    once(event: string, fn: (...args: unknown[]) => void): this {
      const wrapper = (...args: unknown[]): void => {
        fn(...args);
        this.off(event, wrapper);
      };
      return this.on(event, wrapper);
    }

    off(event: string, fn: (...args: unknown[]) => void): this {
      this._handlers[event] = (this._handlers[event] ?? []).filter((h) => h !== fn);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      for (const h of [...(this._handlers[event] ?? [])]) h(...args);
    }

    listenerCount(event: string): number {
      return (this._handlers[event] ?? []).length;
    }
  }

  class MockWebSocket extends SimpleEmitter {
    static readonly OPEN = 1;
    readyState: number;
    url: string;
    sentMessages: string[] = [];
    closeCallCount = 0;

    constructor(url: string) {
      super();
      this.url = url;
      this.readyState = MockWebSocket.OPEN;
      // Fire 'open' asynchronously so the session constructor can attach listeners first.
      setImmediate(() => this.emit('open'));
    }

    send(data: string): void { this.sentMessages.push(data); }

    close(): void {
      this.closeCallCount++;
      this.readyState = 3; // CLOSED
      this.emit('close');
    }

    /** Helper: simulate a binary (MP3 audio) message from the server. */
    simulateBinaryMessage(data: Buffer): void { this.emit('message', data, true); }

    /** Helper: simulate a JSON text message from the server. */
    simulateJsonMessage(obj: object): void {
      this.emit('message', JSON.stringify(obj), false);
    }
  }

  return { default: MockWebSocket };
});

// ---------------------------------------------------------------------------
// Type alias for the mock instance (mirrors MockWebSocket without import)
// ---------------------------------------------------------------------------

type MockWS = {
  url: string;
  sentMessages: string[];
  closeCallCount: number;
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: string, fn: (...args: unknown[]) => void): MockWS;
  once(event: string, fn: (...args: unknown[]) => void): MockWS;
  emit(event: string, ...args: unknown[]): void;
  listenerCount(event: string): number;
  simulateBinaryMessage(data: Buffer): void;
  simulateJsonMessage(obj: object): void;
};

// ---------------------------------------------------------------------------
// Import session AFTER mock is established
// ---------------------------------------------------------------------------

import { ElevenLabsTTSSession } from '../src/ElevenLabsTTSSession.js';
import type { EncodedAudioChunk } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fake MP3 audio bytes used as stand-in for a real audio chunk. */
const FAKE_AUDIO = Buffer.from([0xff, 0xfb, 0x90, 0x64]);

/**
 * Create a {@link ElevenLabsTTSSession} and wait for the WebSocket `open`
 * event to be processed (so the BOS message has been sent).
 *
 * @returns The session and its internal mock WebSocket.
 */
async function makeSession(overrides?: {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}): Promise<{ session: ElevenLabsTTSSession; ws: MockWS }> {
  const session = new ElevenLabsTTSSession(
    {
      apiKey:          overrides?.apiKey          ?? 'test-xi-key',
      voiceId:         overrides?.voiceId,
      modelId:         overrides?.modelId,
      stability:       overrides?.stability,
      similarityBoost: overrides?.similarityBoost,
      style:           overrides?.style,
      useSpeakerBoost: overrides?.useSpeakerBoost,
    },
    {},
  );

  // Access the internal WS instance.
  const ws = (session as unknown as { ws: MockWS }).ws;

  // Wait two ticks: one for setImmediate('open'), one for the open handler drain.
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));

  return { session, ws };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ElevenLabsTTSSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Opens WebSocket to correct URL
  // -------------------------------------------------------------------------

  it('opens WebSocket to the correct ElevenLabs streaming URL', async () => {
    const { session, ws } = await makeSession({
      voiceId: 'test-voice-id',
      modelId: 'eleven_turbo_v2',
    });

    expect(ws.url).toBe(
      'wss://api.elevenlabs.io/v1/text-to-speech/test-voice-id/stream-input' +
      '?model_id=eleven_turbo_v2&output_format=mp3_44100_128',
    );

    session.close();
  });

  // -------------------------------------------------------------------------
  // 2. Sends BOS message with voice settings and API key
  // -------------------------------------------------------------------------

  it('sends BOS message with voice settings and xi_api_key on open', async () => {
    const { session, ws } = await makeSession({
      apiKey:          'my-xi-key',
      stability:       0.6,
      similarityBoost: 0.8,
      style:           0.1,
      useSpeakerBoost: false,
    });

    expect(ws.sentMessages.length).toBeGreaterThanOrEqual(1);
    const bos = JSON.parse(ws.sentMessages[0]!) as Record<string, unknown>;

    expect(bos['text']).toBe(' ');
    expect(bos['xi_api_key']).toBe('my-xi-key');

    const vs = bos['voice_settings'] as Record<string, unknown>;
    expect(vs['stability']).toBe(0.6);
    expect(vs['similarity_boost']).toBe(0.8);
    expect(vs['style']).toBe(0.1);
    expect(vs['use_speaker_boost']).toBe(false);

    session.close();
  });

  // -------------------------------------------------------------------------
  // 3. pushTokens sends text as JSON
  // -------------------------------------------------------------------------

  it('pushTokens sends a JSON text message to the WebSocket', async () => {
    const { session, ws } = await makeSession();

    const countBefore = ws.sentMessages.length;
    session.pushTokens('Hello ');

    expect(ws.sentMessages.length).toBe(countBefore + 1);
    const msg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]!) as Record<string, unknown>;
    expect(msg['text']).toBe('Hello ');

    session.close();
  });

  // -------------------------------------------------------------------------
  // 4. Sentence boundary sends with flush: true
  // -------------------------------------------------------------------------

  it('sends flush: true when a sentence boundary punctuation is detected', async () => {
    const { session, ws } = await makeSession();

    session.pushTokens('Hello world.');

    const msgs = ws.sentMessages.slice(1); // skip BOS
    const flushMsg = msgs.find((m) => {
      const parsed = JSON.parse(m) as Record<string, unknown>;
      return parsed['flush'] === true;
    });

    expect(flushMsg).toBeDefined();
    const parsed = JSON.parse(flushMsg!) as Record<string, unknown>;
    expect((parsed['text'] as string)).toContain('Hello world.');

    session.close();
  });

  // -------------------------------------------------------------------------
  // 5. Incoming binary → emits audio_chunk
  // -------------------------------------------------------------------------

  it('emits audio_chunk when the server sends a binary message', async () => {
    const { session, ws } = await makeSession();

    const chunks: EncodedAudioChunk[] = [];
    session.on('audio_chunk', (chunk: EncodedAudioChunk) => chunks.push(chunk));

    ws.simulateBinaryMessage(FAKE_AUDIO);

    expect(chunks).toHaveLength(1);
    expect(Buffer.isBuffer(chunks[0]!.audio)).toBe(true);
    expect(chunks[0]!.audio).toEqual(FAKE_AUDIO);
    expect(chunks[0]!.format).toBe('mp3');
    expect(chunks[0]!.sampleRate).toBe(44100);

    session.close();
  });

  // -------------------------------------------------------------------------
  // 6. flush sends EOS message
  // -------------------------------------------------------------------------

  it('flush() sends EOS message { text: "" } to the WebSocket', async () => {
    const { session, ws } = await makeSession();

    await session.flush();

    const msgs = ws.sentMessages.slice(1); // skip BOS
    const eosMsgs = msgs.filter((m) => {
      const parsed = JSON.parse(m) as Record<string, unknown>;
      return parsed['text'] === '';
    });

    expect(eosMsgs.length).toBeGreaterThanOrEqual(1);

    session.close();
  });

  // -------------------------------------------------------------------------
  // 7. cancel closes WS and emits cancelled
  // -------------------------------------------------------------------------

  it('cancel() closes the WebSocket and emits cancelled with remaining text', async () => {
    const { session, ws } = await makeSession();

    const cancelledEvents: Array<{ remaining: string }> = [];
    session.on('cancelled', (evt: { remaining: string }) => cancelledEvents.push(evt));

    // Push text without a sentence boundary — it stays in pendingText.
    session.pushTokens('Unfinished thought');
    session.cancel();

    expect(ws.closeCallCount).toBeGreaterThanOrEqual(1);
    expect(cancelledEvents).toHaveLength(1);
    expect(cancelledEvents[0]!.remaining).toBe('Unfinished thought');
  });

  // -------------------------------------------------------------------------
  // 8. close sends close frame
  // -------------------------------------------------------------------------

  it('close() calls ws.close() and emits close event', async () => {
    const { session, ws } = await makeSession();

    const closeEvents: number[] = [];
    session.on('close', () => closeEvents.push(1));

    session.close();

    expect(ws.closeCallCount).toBeGreaterThanOrEqual(1);
    expect(closeEvents).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 9. utterance_complete on isFinal JSON message
  // -------------------------------------------------------------------------

  it('emits utterance_complete when server sends { isFinal: true }', async () => {
    const { session, ws } = await makeSession();

    const completeEvents: Array<{ text: string; durationMs: number }> = [];
    session.on(
      'utterance_complete',
      (evt: { text: string; durationMs: number }) => completeEvents.push(evt),
    );

    ws.simulateJsonMessage({ isFinal: true });

    expect(completeEvents).toHaveLength(1);
    expect(typeof completeEvents[0]!.durationMs).toBe('number');

    session.close();
  });

  // -------------------------------------------------------------------------
  // 10. pushTokens after close is ignored
  // -------------------------------------------------------------------------

  it('pushTokens after close() is silently ignored', async () => {
    const { session, ws } = await makeSession();

    session.close();
    const countAfterClose = ws.sentMessages.length;

    session.pushTokens('Ignored text.');

    expect(ws.sentMessages.length).toBe(countAfterClose);
  });
});
