// @ts-nocheck
/**
 * @file PorcupineWakeWordProvider.spec.ts
 * @description Unit tests for {@link PorcupineWakeWordProvider}.
 *
 * The `@picovoice/porcupine-node` native module is mocked via `vi.mock` so
 * tests run without a real Porcupine installation or Picovoice access key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @picovoice/porcupine-node
// ---------------------------------------------------------------------------

/**
 * Captures every Porcupine constructor invocation for assertions.
 */
const mockPorcupineInstances: Array<{
  constructorArgs: [string, string[], number[]];
  processCalls: Int16Array[];
  releaseCalls: number;
  nextProcessResult: number;
}> = [];

vi.mock('@picovoice/porcupine-node', () => {
  class MockPorcupine {
    _info: {
      constructorArgs: [string, string[], number[]];
      processCalls: Int16Array[];
      releaseCalls: number;
      nextProcessResult: number;
    };

    constructor(accessKey: string, keywords: string[], sensitivities: number[]) {
      this._info = {
        constructorArgs: [accessKey, keywords, sensitivities],
        processCalls: [],
        releaseCalls: 0,
        nextProcessResult: -1, // default: no detection
      };
      mockPorcupineInstances.push(this._info);
    }

    process(frame: Int16Array): number {
      this._info.processCalls.push(frame);
      return this._info.nextProcessResult;
    }

    release() {
      this._info.releaseCalls++;
    }
  }

  return { Porcupine: MockPorcupine };
});

// ---------------------------------------------------------------------------
// Import module under test AFTER mock declaration
// ---------------------------------------------------------------------------

import { PorcupineWakeWordProvider } from '../src/PorcupineWakeWordProvider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a 512-sample Int16Array (one Porcupine frame). */
function makeFrame(): Int16Array {
  return new Int16Array(512).fill(0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PorcupineWakeWordProvider', () => {
  beforeEach(() => {
    mockPorcupineInstances.length = 0;
  });

  // 1. id
  it('exposes id = "porcupine"', () => {
    const provider = new PorcupineWakeWordProvider({ accessKey: 'key123' });
    expect(provider.id).toBe('porcupine');
  });

  // 2. Default keywords
  it('defaults to ["porcupine"] keyword', () => {
    const provider = new PorcupineWakeWordProvider({ accessKey: 'key' });
    expect(provider.getKeywords()).toEqual(['porcupine']);
  });

  // 3. Custom keywords
  it('uses provided keywords', () => {
    const provider = new PorcupineWakeWordProvider({
      accessKey: 'key',
      keywords: ['bumblebee', 'jarvis'],
    });
    expect(provider.getKeywords()).toEqual(['bumblebee', 'jarvis']);
  });

  // 4. Default sensitivities
  it('defaults sensitivity to 0.5 per keyword', () => {
    const provider = new PorcupineWakeWordProvider({
      accessKey: 'key',
      keywords: ['porcupine', 'bumblebee'],
    });
    expect(provider.getSensitivities()).toEqual([0.5, 0.5]);
  });

  // 5. Custom sensitivities
  it('uses provided sensitivities', () => {
    const provider = new PorcupineWakeWordProvider({
      accessKey: 'key',
      keywords: ['porcupine'],
      sensitivities: [0.8],
    });
    expect(provider.getSensitivities()).toEqual([0.8]);
  });

  // 6. Lazy initialisation — Porcupine not created until first detect()
  it('does not create Porcupine instance until first detect() call', async () => {
    new PorcupineWakeWordProvider({ accessKey: 'key' });
    expect(mockPorcupineInstances).toHaveLength(0);
  });

  // 7. Porcupine is created with correct args
  it('creates Porcupine with accessKey, keywords, and sensitivities', async () => {
    const provider = new PorcupineWakeWordProvider({
      accessKey: 'my-key',
      keywords: ['bumblebee'],
      sensitivities: [0.7],
    });
    await provider.detect(makeFrame(), 16000);

    expect(mockPorcupineInstances).toHaveLength(1);
    const [ak, kws, sens] = mockPorcupineInstances[0]!.constructorArgs;
    expect(ak).toBe('my-key');
    expect(kws).toEqual(['bumblebee']);
    expect(sens).toEqual([0.7]);
  });

  // 8. Porcupine is created only once (singleton per provider instance)
  it('reuses the same Porcupine instance across multiple detect() calls', async () => {
    const provider = new PorcupineWakeWordProvider({ accessKey: 'key' });
    await provider.detect(makeFrame(), 16000);
    await provider.detect(makeFrame(), 16000);
    await provider.detect(makeFrame(), 16000);
    expect(mockPorcupineInstances).toHaveLength(1);
  });

  // 9. process() is called with the frame
  it('calls porcupine.process() with the audio frame', async () => {
    const provider = new PorcupineWakeWordProvider({ accessKey: 'key' });
    const frame = makeFrame();
    await provider.detect(frame, 16000);
    expect(mockPorcupineInstances[0]!.processCalls[0]).toBe(frame);
  });

  // 10. Returns null when process() returns -1
  it('returns null when no wake-word is detected (process() === -1)', async () => {
    const provider = new PorcupineWakeWordProvider({ accessKey: 'key' });
    // Default mock result is -1.
    const result = await provider.detect(makeFrame(), 16000);
    expect(result).toBeNull();
  });

  // 11. Returns detection when process() returns 0
  it('returns WakeWordDetection when process() returns keyword index 0', async () => {
    const provider = new PorcupineWakeWordProvider({
      accessKey: 'key',
      keywords: ['porcupine'],
    });
    await provider.detect(makeFrame(), 16000); // lazy init
    // Set next result to 0.
    mockPorcupineInstances[0]!.nextProcessResult = 0;
    const result = await provider.detect(makeFrame(), 16000);

    expect(result).not.toBeNull();
    expect(result!.keyword).toBe('porcupine');
    expect(result!.confidence).toBe(1.0);
    expect(result!.providerId).toBe('porcupine');
  });

  // 12. Returns correct keyword for index > 0
  it('returns the correct keyword string for index 1', async () => {
    const provider = new PorcupineWakeWordProvider({
      accessKey: 'key',
      keywords: ['porcupine', 'bumblebee'],
      sensitivities: [0.5, 0.5],
    });
    await provider.detect(makeFrame(), 16000);
    mockPorcupineInstances[0]!.nextProcessResult = 1;
    const result = await provider.detect(makeFrame(), 16000);
    expect(result!.keyword).toBe('bumblebee');
  });

  // 13. reset() is a no-op
  it('reset() does not throw', () => {
    const provider = new PorcupineWakeWordProvider({ accessKey: 'key' });
    expect(() => provider.reset()).not.toThrow();
  });

  // 14. dispose() calls porcupine.release()
  it('dispose() calls porcupine.release()', async () => {
    const provider = new PorcupineWakeWordProvider({ accessKey: 'key' });
    await provider.detect(makeFrame(), 16000);
    await provider.dispose();
    expect(mockPorcupineInstances[0]!.releaseCalls).toBe(1);
  });

  // 15. dispose() before detect() does not throw
  it('dispose() before any detect() call is a no-op', async () => {
    const provider = new PorcupineWakeWordProvider({ accessKey: 'key' });
    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
