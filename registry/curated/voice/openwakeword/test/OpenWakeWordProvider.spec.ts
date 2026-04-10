// @ts-nocheck
/**
 * @file OpenWakeWordProvider.spec.ts
 * @description Unit tests for {@link OpenWakeWordProvider}.
 *
 * `onnxruntime-node` is mocked via `vi.mock` so tests run without a real ONNX
 * runtime installation or model file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock onnxruntime-node
// ---------------------------------------------------------------------------

/**
 * Controls what probability value the mock InferenceSession.run() returns.
 * Tests set this before calling detect().
 */
let mockOutputProbability = 0.0;

/**
 * Tracks InferenceSession.create() call arguments.
 */
const mockCreateCalls: string[] = [];

/**
 * Tracks InferenceSession.run() call arguments.
 */
const mockRunCalls: Array<{ input: unknown }> = [];

/**
 * Tracks release calls.
 */
let mockReleaseCalls = 0;

/**
 * Number of times InferenceSession.create() was called — used to verify
 * the session is loaded lazily and only once.
 */
let mockSessionCreateCount = 0;

vi.mock('onnxruntime-node', () => {
  class MockTensor {
    type: string;
    data: Float32Array;
    dims: number[];

    constructor(type: string, data: Float32Array, dims: number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  }

  class MockInferenceSession {
    async run(feeds: { input: unknown }) {
      mockRunCalls.push(feeds);
      return {
        output: { data: new Float32Array([mockOutputProbability]) },
      };
    }

    async release() {
      mockReleaseCalls++;
    }
  }

  return {
    Tensor: MockTensor,
    InferenceSession: {
      create: async (modelPath: string) => {
        mockCreateCalls.push(modelPath);
        mockSessionCreateCount++;
        return new MockInferenceSession();
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Import module under test AFTER mock declaration
// ---------------------------------------------------------------------------

import { OpenWakeWordProvider } from '../src/OpenWakeWordProvider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a 1280-sample Int16Array (80 ms at 16 kHz). */
function makeFrame(samples = 1280): Int16Array {
  return new Int16Array(samples).fill(0);
}

/** Build a frame with a known non-zero pattern for feature extraction tests. */
function makeActiveFrame(): Int16Array {
  const frame = new Int16Array(1280);
  for (let i = 0; i < 1280; i++) {
    // Alternating +/- values → non-zero ZCR, non-zero RMS.
    frame[i] = i % 2 === 0 ? 16384 : -16384;
  }
  return frame;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenWakeWordProvider', () => {
  beforeEach(() => {
    mockOutputProbability = 0.0;
    mockCreateCalls.length = 0;
    mockRunCalls.length = 0;
    mockReleaseCalls = 0;
    mockSessionCreateCount = 0;
  });

  // 1. id
  it('exposes id = "openwakeword"', () => {
    expect(new OpenWakeWordProvider().id).toBe('openwakeword');
  });

  // 2. Default model path
  it('sets default modelPath containing openwakeword/hey_mycroft.onnx', () => {
    delete process.env['OPENWAKEWORD_MODEL_PATH'];
    const provider = new OpenWakeWordProvider();
    expect(provider.getModelPath()).toContain('hey_mycroft.onnx');
  });

  // 3. OPENWAKEWORD_MODEL_PATH env var
  it('reads modelPath from OPENWAKEWORD_MODEL_PATH env var', () => {
    process.env['OPENWAKEWORD_MODEL_PATH'] = '/opt/models/custom.onnx';
    const provider = new OpenWakeWordProvider();
    delete process.env['OPENWAKEWORD_MODEL_PATH'];
    expect(provider.getModelPath()).toBe('/opt/models/custom.onnx');
  });

  // 4. modelPath option overrides env
  it('uses modelPath option over env var', () => {
    process.env['OPENWAKEWORD_MODEL_PATH'] = '/env/model.onnx';
    const provider = new OpenWakeWordProvider({ modelPath: '/opt/model.onnx' });
    delete process.env['OPENWAKEWORD_MODEL_PATH'];
    expect(provider.getModelPath()).toBe('/opt/model.onnx');
  });

  // 5. Default threshold
  it('defaults threshold to 0.5', () => {
    expect(new OpenWakeWordProvider().getThreshold()).toBe(0.5);
  });

  // 6. Custom threshold
  it('uses provided threshold', () => {
    expect(new OpenWakeWordProvider({ threshold: 0.8 }).getThreshold()).toBe(0.8);
  });

  // 7. Default keyword
  it('defaults keyword to "hey mycroft"', () => {
    expect(new OpenWakeWordProvider().getKeyword()).toBe('hey mycroft');
  });

  // 8. Custom keyword
  it('uses provided keyword', () => {
    expect(new OpenWakeWordProvider({ keyword: 'hey jarvis' }).getKeyword()).toBe('hey jarvis');
  });

  // 9. Lazy loading — session not created until first detect()
  it('does not create ONNX session until first detect() call', async () => {
    new OpenWakeWordProvider({ modelPath: '/m.onnx' });
    expect(mockSessionCreateCount).toBe(0);
  });

  // 10. Session is created with the correct model path
  it('calls InferenceSession.create() with the model path', async () => {
    const provider = new OpenWakeWordProvider({ modelPath: '/my/model.onnx' });
    await provider.detect(makeFrame(), 16000);
    expect(mockCreateCalls).toContain('/my/model.onnx');
  });

  // 11. Session is created only once
  it('creates the ONNX session only once across multiple detect() calls', async () => {
    const provider = new OpenWakeWordProvider({ modelPath: '/m.onnx' });
    await provider.detect(makeFrame(), 16000);
    await provider.detect(makeFrame(), 16000);
    await provider.detect(makeFrame(), 16000);
    expect(mockSessionCreateCount).toBe(1);
  });

  // 12. session.run() is called on every detect()
  it('calls session.run() for each detect() call', async () => {
    const provider = new OpenWakeWordProvider({ modelPath: '/m.onnx' });
    await provider.detect(makeFrame(), 16000);
    await provider.detect(makeFrame(), 16000);
    expect(mockRunCalls).toHaveLength(2);
  });

  // 13. session.run() receives an input tensor
  it('passes an input tensor with key "input" to session.run()', async () => {
    const provider = new OpenWakeWordProvider({ modelPath: '/m.onnx' });
    await provider.detect(makeFrame(), 16000);
    const feeds = mockRunCalls[0] as { input: unknown };
    expect(feeds).toHaveProperty('input');
  });

  // 14. Returns null when probability is below threshold
  it('returns null when model probability is below threshold', async () => {
    mockOutputProbability = 0.3;
    const provider = new OpenWakeWordProvider({ modelPath: '/m.onnx', threshold: 0.5 });
    const result = await provider.detect(makeFrame(), 16000);
    expect(result).toBeNull();
  });

  // 15. Returns null when probability equals threshold (strictly greater than)
  it('returns null when probability equals the threshold', async () => {
    mockOutputProbability = 0.5;
    const provider = new OpenWakeWordProvider({ modelPath: '/m.onnx', threshold: 0.5 });
    const result = await provider.detect(makeFrame(), 16000);
    expect(result).toBeNull();
  });

  // 16. Returns detection when probability exceeds threshold
  it('returns WakeWordDetection when model probability exceeds threshold', async () => {
    mockOutputProbability = 0.8;
    const provider = new OpenWakeWordProvider({
      modelPath: '/m.onnx',
      threshold: 0.5,
      keyword: 'hey mycroft',
    });
    const result = await provider.detect(makeFrame(), 16000);
    expect(result).not.toBeNull();
    expect(result!.keyword).toBe('hey mycroft');
    expect(result!.confidence).toBeCloseTo(0.8);
    expect(result!.providerId).toBe('openwakeword');
  });

  // 17. Feature extraction: silent frame has near-zero RMS and ZCR
  it('extracts near-zero features from a silent frame', async () => {
    mockOutputProbability = 0.0;
    const provider = new OpenWakeWordProvider({ modelPath: '/m.onnx' });
    await provider.detect(makeFrame(), 16000); // silent (all zeros)

    const feed = mockRunCalls[0] as { input: { data: Float32Array } };
    const features = feed.input.data;
    expect(features[0]).toBeCloseTo(0); // RMS
    expect(features[1]).toBe(0);        // ZCR
  });

  // 18. Feature extraction: active frame has non-zero RMS and ZCR
  it('extracts non-zero features from an active frame', async () => {
    mockOutputProbability = 0.0;
    const provider = new OpenWakeWordProvider({ modelPath: '/m.onnx' });
    await provider.detect(makeActiveFrame(), 16000);

    const feed = mockRunCalls[0] as { input: { data: Float32Array } };
    const features = feed.input.data;
    expect(features[0]).toBeGreaterThan(0); // RMS
    expect(features[1]).toBeGreaterThan(0); // ZCR
  });

  // 19. reset() is a no-op and does not throw
  it('reset() does not throw', () => {
    const provider = new OpenWakeWordProvider({ modelPath: '/m.onnx' });
    expect(() => provider.reset()).not.toThrow();
  });

  // 20. dispose() releases the session
  it('dispose() releases the ONNX session', async () => {
    const provider = new OpenWakeWordProvider({ modelPath: '/m.onnx' });
    await provider.detect(makeFrame(), 16000);
    await provider.dispose();
    expect(mockReleaseCalls).toBe(1);
  });

  // 21. dispose() before detect() does not throw
  it('dispose() before any detect() is a no-op', async () => {
    const provider = new OpenWakeWordProvider({ modelPath: '/m.onnx' });
    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
