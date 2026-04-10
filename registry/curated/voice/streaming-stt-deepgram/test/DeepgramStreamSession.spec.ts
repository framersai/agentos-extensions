// @ts-nocheck
/**
 * @file DeepgramStreamSession.spec.ts
 * @description Unit tests for {@link DeepgramStreamSession}.
 *
 * The Deepgram WebSocket is mocked via `vi.mock('ws')` so tests run without a
 * network connection or a real API key.  The mock captures every constructed
 * WebSocket in a module-level registry so individual tests can simulate server
 * messages and close events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock WebSocket — the factory MUST NOT reference any outer `let`/`const` that
// is declared after the `vi.mock()` call, because vi.mock is hoisted to the top
// of the compiled output.  We store instances on the class itself (static).
// ---------------------------------------------------------------------------

vi.mock('ws', () => {
  const { EventEmitter } = require('node:events');

  class MockWS extends EventEmitter {
    static instances: MockWS[] = [];

    sent: Array<Buffer | string> = [];
    terminated = false;
    url: string;
    options: unknown;

    constructor(url: string, options?: unknown) {
      super();
      this.url = url;
      this.options = options;
      MockWS.instances.push(this);
      setImmediate(() => this.emit('open'));
    }

    send(data: Buffer | string): void {
      this.sent.push(data);
    }

    terminate(): void {
      this.terminated = true;
      this.emit('close', 1006);
    }

    close(code = 1000): void {
      this.emit('close', code);
    }

    simulateMessage(payload: unknown): void {
      this.emit('message', JSON.stringify(payload));
    }

    static get latest(): MockWS {
      return MockWS.instances[MockWS.instances.length - 1]!;
    }

    static reset(): void {
      MockWS.instances = [];
    }
  }

  return { default: MockWS };
});

// ---------------------------------------------------------------------------
// Import module under test AFTER mock declaration
// ---------------------------------------------------------------------------

import WS from 'ws';
import { DeepgramStreamSession } from '../src/DeepgramStreamSession.js';
import { extractSpeakerFromWords } from '../src/DeepgramDiarizationAdapter.js';

// Cast to access the static mock helpers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockWebSocket = WS as unknown as {
  instances: Array<{
    url: string;
    options: { headers?: Record<string, string> };
    sent: Array<Buffer | string>;
    terminated: boolean;
    on(event: string, handler: (...a: unknown[]) => void): void;
    simulateMessage(payload: unknown): void;
  }>;
  latest: {
    url: string;
    options: { headers?: Record<string, string> };
    sent: Array<Buffer | string>;
    terminated: boolean;
    simulateMessage(payload: unknown): void;
  };
  reset(): void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the setImmediate 'open' event to fire. */
function waitOpen(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Build a minimal AudioFrame. */
function makeFrame(n = 4): { samples: Float32Array; sampleRate: number; timestamp: number } {
  return { samples: new Float32Array(n).fill(0.5), sampleRate: 16000, timestamp: Date.now() };
}

/** Build a minimal Deepgram Results message. */
function makeResult(opts: {
  transcript?: string;
  confidence?: number;
  isFinal?: boolean;
  speechFinal?: boolean;
  words?: Array<{ word: string; start: number; end: number; confidence: number; speaker?: number }>;
  duration?: number;
}) {
  return {
    type: 'Results',
    is_final: opts.isFinal ?? false,
    speech_final: opts.speechFinal ?? false,
    duration: opts.duration,
    channel: {
      alternatives: [
        {
          transcript: opts.transcript ?? '',
          confidence: opts.confidence ?? 0.9,
          words: opts.words ?? [],
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeepgramStreamSession', () => {
  beforeEach(() => {
    MockWebSocket.reset();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // 1. URL + auth header
  it('opens WebSocket with correct URL query params and Authorization header', async () => {
    const session = new DeepgramStreamSession({
      apiKey: 'test-key-123',
      model: 'nova-2',
      language: 'en-US',
      punctuate: true,
      interimResults: true,
      diarize: false,
    });

    await waitOpen();

    const ws = MockWebSocket.latest;
    expect(ws.url).toContain('wss://api.deepgram.com/v1/listen');
    expect(ws.url).toContain('model=nova-2');
    expect(ws.url).toContain('language=en-US');
    expect(ws.url).toContain('punctuate=true');
    expect(ws.url).toContain('interim_results=true');
    expect(ws.url).toContain('diarize=false');
    expect(ws.url).toContain('encoding=linear16');
    expect(ws.url).toContain('sample_rate=16000');
    expect(ws.url).toContain('channels=1');
    expect(ws.options?.headers?.Authorization).toBe('Token test-key-123');

    session.close();
  });

  // 2. pushAudio Float32 → Int16 binary
  it('pushAudio converts Float32 samples to Int16 PCM and sends binary', async () => {
    const session = new DeepgramStreamSession({ apiKey: 'key' });
    await waitOpen();

    const frame = makeFrame(4); // all 0.5
    session.pushAudio(frame as Parameters<typeof session.pushAudio>[0]);

    const ws = MockWebSocket.latest;
    expect(ws.sent).toHaveLength(1);

    const sent = ws.sent[0] as Buffer;
    expect(Buffer.isBuffer(sent)).toBe(true);
    expect(sent.byteLength).toBe(8); // 4 samples × 2 bytes
    // Math.round(0.5 * 0x7FFF) = Math.round(16383.5) = 16384 (JS rounds 0.5 up)
    expect(sent.readInt16LE(0)).toBe(16384);

    session.close();
  });

  // 3. Interim → 'interim_transcript'
  it('parses Deepgram interim result and emits interim_transcript', async () => {
    const session = new DeepgramStreamSession({ apiKey: 'key' });
    await waitOpen();

    const handler = vi.fn();
    session.on('interim_transcript', handler);

    MockWebSocket.latest.simulateMessage(makeResult({ transcript: 'hello wor', isFinal: false }));

    expect(handler).toHaveBeenCalledOnce();
    const evt = handler.mock.calls[0]![0] as { text: string; isFinal: boolean };
    expect(evt.text).toBe('hello wor');
    expect(evt.isFinal).toBe(false);

    session.close();
  });

  // 4. Final → 'final_transcript'
  it('parses Deepgram final result and emits final_transcript (not interim)', async () => {
    const session = new DeepgramStreamSession({ apiKey: 'key' });
    await waitOpen();

    const finalHandler = vi.fn();
    const interimHandler = vi.fn();
    session.on('final_transcript', finalHandler);
    session.on('interim_transcript', interimHandler);

    MockWebSocket.latest.simulateMessage(makeResult({ transcript: 'hello world', isFinal: true }));

    expect(finalHandler).toHaveBeenCalledOnce();
    expect(interimHandler).not.toHaveBeenCalled();

    const evt = finalHandler.mock.calls[0]![0] as { text: string; isFinal: boolean };
    expect(evt.text).toBe('hello world');
    expect(evt.isFinal).toBe(true);

    session.close();
  });

  // 5. speech_final → 'speech_end'
  it('emits speech_end when speech_final is true', async () => {
    const session = new DeepgramStreamSession({ apiKey: 'key' });
    await waitOpen();

    const handler = vi.fn();
    session.on('speech_end', handler);

    MockWebSocket.latest.simulateMessage(
      makeResult({ transcript: 'done', isFinal: true, speechFinal: true }),
    );

    expect(handler).toHaveBeenCalledOnce();
    session.close();
  });

  // 6. flush() sends CloseStream
  it('flush() sends a CloseStream JSON message', async () => {
    const session = new DeepgramStreamSession({ apiKey: 'key' });
    await waitOpen();

    await session.flush();

    const ws = MockWebSocket.latest;
    const closeMsg = ws.sent.find(
      (m) => typeof m === 'string' && JSON.parse(m).type === 'CloseStream',
    );
    expect(closeMsg).toBeDefined();

    session.close();
  });

  // 7. close() terminates WebSocket
  it('close() terminates the WebSocket and emits close event', async () => {
    const session = new DeepgramStreamSession({ apiKey: 'key' });
    await waitOpen();

    const closeHandler = vi.fn();
    session.on('close', closeHandler);

    session.close();

    expect(MockWebSocket.latest.terminated).toBe(true);
    expect(closeHandler).toHaveBeenCalledOnce();
  });

  // 8. Speaker extraction — majority speaker
  it('extractSpeakerFromWords returns the majority speaker label', () => {
    const words = [
      { word: 'Hello', start: 0.0, end: 0.3, confidence: 0.99, speaker: 0 },
      { word: 'there', start: 0.4, end: 0.7, confidence: 0.97, speaker: 1 },
      { word: 'welcome', start: 0.8, end: 1.1, confidence: 0.95, speaker: 0 },
      { word: 'back', start: 1.2, end: 1.5, confidence: 0.94, speaker: 0 },
    ];
    expect(extractSpeakerFromWords(words)).toBe('Speaker_0');
  });

  it('extractSpeakerFromWords returns undefined for empty array', () => {
    expect(extractSpeakerFromWords([])).toBeUndefined();
  });

  it('extractSpeakerFromWords returns undefined when no words carry speaker field', () => {
    const words = [{ word: 'hi', start: 0, end: 0.3, confidence: 0.99 }];
    expect(
      extractSpeakerFromWords(words as Parameters<typeof extractSpeakerFromWords>[0]),
    ).toBeUndefined();
  });

  // 9. speech_start fires once per utterance
  it('emits speech_start on first non-empty transcript and resets after final', async () => {
    const session = new DeepgramStreamSession({ apiKey: 'key' });
    await waitOpen();

    const handler = vi.fn();
    session.on('speech_start', handler);

    MockWebSocket.latest.simulateMessage(makeResult({ transcript: 'hi', isFinal: false }));
    expect(handler).toHaveBeenCalledTimes(1);

    // Second interim — no repeat
    MockWebSocket.latest.simulateMessage(makeResult({ transcript: 'hi there', isFinal: false }));
    expect(handler).toHaveBeenCalledTimes(1);

    // Final — resets flag
    MockWebSocket.latest.simulateMessage(makeResult({ transcript: 'hi there', isFinal: true }));

    // New utterance
    MockWebSocket.latest.simulateMessage(makeResult({ transcript: 'new', isFinal: false }));
    expect(handler).toHaveBeenCalledTimes(2);

    session.close();
  });

  // 10. 'transcript' base event is always emitted
  it('emits base transcript event for both interim and final results', async () => {
    const session = new DeepgramStreamSession({ apiKey: 'key' });
    await waitOpen();

    const handler = vi.fn();
    session.on('transcript', handler);

    MockWebSocket.latest.simulateMessage(makeResult({ transcript: 'a', isFinal: false }));
    MockWebSocket.latest.simulateMessage(makeResult({ transcript: 'ab', isFinal: true }));

    expect(handler).toHaveBeenCalledTimes(2);
    session.close();
  });
});
