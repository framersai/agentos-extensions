/**
 * @file VoskSTTProvider.spec.ts
 * @description Unit tests for {@link VoskSTTProvider}.
 *
 * The `vosk` native module is mocked via `vi.mock` so tests run without a real
 * Vosk installation or model on disk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock `vosk`
// ---------------------------------------------------------------------------

/**
 * Captures every Recognizer instance created during a test so we can assert
 * on the constructor arguments and method calls.
 */
const mockRecognizerInstances: Array<{
  constructorArgs: unknown;
  acceptWaveformCalls: Buffer[];
  finalResultCalls: number;
  freeCalls: number;
}> = [];

/**
 * Tracks how many times the Model constructor has been invoked — used to verify
 * the singleton is only created once.
 */
let mockModelConstructorCalls = 0;

vi.mock('vosk', () => {
  class MockModel {
    _path: string;
    constructor(modelPath: string) {
      mockModelConstructorCalls++;
      this._path = modelPath;
    }
  }

  class MockRecognizer {
    _info: {
      constructorArgs: unknown;
      acceptWaveformCalls: Buffer[];
      finalResultCalls: number;
      freeCalls: number;
    };

    constructor(args: unknown) {
      this._info = {
        constructorArgs: args,
        acceptWaveformCalls: [],
        finalResultCalls: 0,
        freeCalls: 0,
      };
      mockRecognizerInstances.push(this._info);
    }

    acceptWaveform(buf: Buffer) {
      this._info.acceptWaveformCalls.push(buf);
    }

    finalResult() {
      this._info.finalResultCalls++;
      return { text: 'hello vosk' };
    }

    free() {
      this._info.freeCalls++;
    }
  }

  return { Model: MockModel, Recognizer: MockRecognizer };
});

// ---------------------------------------------------------------------------
// Import module under test AFTER mock declaration
// ---------------------------------------------------------------------------

import {
  VoskSTTProvider,
  _resetModelSingleton,
  _getModelSingleton,
} from '../src/VoskSTTProvider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePcm(bytes = 3200): Buffer {
  return Buffer.alloc(bytes, 0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VoskSTTProvider', () => {
  beforeEach(() => {
    // Reset module-level singleton between tests.
    _resetModelSingleton();
    mockModelConstructorCalls = 0;
    mockRecognizerInstances.length = 0;
  });

  // 1. id
  it('exposes id = "vosk"', () => {
    const provider = new VoskSTTProvider();
    expect(provider.id).toBe('vosk');
  });

  // 2. supportsStreaming
  it('exposes supportsStreaming = true', () => {
    const provider = new VoskSTTProvider();
    expect(provider.supportsStreaming).toBe(true);
  });

  // 3. Default model path falls back to ~/.agentos/models/vosk/
  it('uses default model path when no options provided', () => {
    const provider = new VoskSTTProvider();
    expect(provider.getModelPath()).toContain('.agentos');
    expect(provider.getModelPath()).toContain('vosk');
  });

  // 4. Custom model path is respected
  it('uses the modelPath option when provided', () => {
    const provider = new VoskSTTProvider({ modelPath: '/opt/models/vosk-en' });
    expect(provider.getModelPath()).toBe('/opt/models/vosk-en');
  });

  // 5. VOSK_MODEL_PATH env var is used when no option provided
  it('reads VOSK_MODEL_PATH env var as fallback', () => {
    process.env['VOSK_MODEL_PATH'] = '/env/vosk-model';
    const provider = new VoskSTTProvider();
    delete process.env['VOSK_MODEL_PATH'];
    expect(provider.getModelPath()).toBe('/env/vosk-model');
  });

  // 6. Model is loaded lazily — not on construction
  it('does not load the model until transcribe() is first called', async () => {
    new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    expect(_getModelSingleton()).toBeNull();
  });

  // 7. Model is loaded exactly once across multiple transcribe() calls
  it('creates the Model singleton only once across multiple transcribe() calls', async () => {
    const provider = new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    await provider.transcribe({ data: makePcm() });
    await provider.transcribe({ data: makePcm() });
    await provider.transcribe({ data: makePcm() });
    expect(mockModelConstructorCalls).toBe(1);
  });

  // 8. Model is shared across provider instances
  it('shares the model singleton between two provider instances', async () => {
    const p1 = new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    const p2 = new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    await p1.transcribe({ data: makePcm() });
    await p2.transcribe({ data: makePcm() });
    expect(mockModelConstructorCalls).toBe(1);
  });

  // 9. Recognizer is created per-call (fresh instance each time)
  it('creates a new Recognizer for each transcribe() call', async () => {
    const provider = new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    await provider.transcribe({ data: makePcm() });
    await provider.transcribe({ data: makePcm() });
    expect(mockRecognizerInstances).toHaveLength(2);
  });

  // 10. Recognizer constructor receives model and sampleRate
  it('passes model and sampleRate to Recognizer constructor', async () => {
    const provider = new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    await provider.transcribe({ data: makePcm(), sampleRate: 8000 });
    const args = mockRecognizerInstances[0]!.constructorArgs as {
      sampleRate: number;
      model: unknown;
    };
    expect(args.sampleRate).toBe(8000);
    expect(args.model).toBeDefined();
  });

  // 11. Default sampleRate is 16000
  it('defaults sampleRate to 16000 when audio.sampleRate is omitted', async () => {
    const provider = new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    await provider.transcribe({ data: makePcm() });
    const args = mockRecognizerInstances[0]!.constructorArgs as { sampleRate: number };
    expect(args.sampleRate).toBe(16000);
  });

  // 12. acceptWaveform is called with the audio buffer
  it('calls recognizer.acceptWaveform() with the audio data', async () => {
    const provider = new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    const pcm = makePcm(6400);
    await provider.transcribe({ data: pcm });
    expect(mockRecognizerInstances[0]!.acceptWaveformCalls).toHaveLength(1);
    expect(mockRecognizerInstances[0]!.acceptWaveformCalls[0]).toBe(pcm);
  });

  // 13. finalResult() is called
  it('calls recognizer.finalResult() to flush the hypothesis', async () => {
    const provider = new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    await provider.transcribe({ data: makePcm() });
    expect(mockRecognizerInstances[0]!.finalResultCalls).toBe(1);
  });

  // 14. Recognizer is freed after each call
  it('calls recognizer.free() after transcription', async () => {
    const provider = new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    await provider.transcribe({ data: makePcm() });
    expect(mockRecognizerInstances[0]!.freeCalls).toBe(1);
  });

  // 15. Result is mapped to SpeechTranscriptionResult
  it('maps Vosk { text } result to SpeechTranscriptionResult[]', async () => {
    const provider = new VoskSTTProvider({ modelPath: '/tmp/vosk' });
    const results = await provider.transcribe({ data: makePcm() });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ transcript: 'hello vosk', confidence: 1, isFinal: true });
  });
});
