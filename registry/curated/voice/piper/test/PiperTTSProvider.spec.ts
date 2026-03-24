/**
 * @file PiperTTSProvider.spec.ts
 * @description Unit tests for {@link PiperTTSProvider}.
 *
 * `child_process.spawn` is mocked so tests run without a real Piper binary.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Mock child_process
// ---------------------------------------------------------------------------

/**
 * A minimal fake child process that mirrors the EventEmitter-based API used by
 * Node's `ChildProcess`.
 */
class FakeProcess extends EventEmitter {
  stdin: { write: MockedFunction<(data: string) => void>; end: MockedFunction<() => void> };
  stdout: EventEmitter;
  stderr: EventEmitter;

  kill = vi.fn();

  constructor() {
    super();
    this.stdin = { write: vi.fn(), end: vi.fn() };
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
  }

  /** Convenience: emit a WAV chunk on stdout and then close with code 0. */
  emitSuccess(wavBytes: Buffer) {
    this.stdout.emit('data', wavBytes);
    this.emit('close', 0);
  }

  /** Convenience: close with a non-zero exit code. */
  emitError(code: number) {
    this.emit('close', code);
  }
}

/** Captured FakeProcess instances per test. */
let fakeProcesses: FakeProcess[] = [];

vi.mock('child_process', () => ({
  spawn: vi.fn((..._args: unknown[]) => {
    const proc = new FakeProcess();
    fakeProcesses.push(proc);
    return proc;
  }),
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import { PiperTTSProvider } from '../src/PiperTTSProvider.js';
import { spawn } from 'child_process';

const mockSpawn = spawn as unknown as MockedFunction<typeof spawn>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PiperTTSProvider', () => {
  beforeEach(() => {
    fakeProcesses = [];
    mockSpawn.mockClear();
  });

  // 1. id
  it('exposes id = "piper"', () => {
    expect(new PiperTTSProvider().id).toBe('piper');
  });

  // 2. supportsStreaming
  it('exposes supportsStreaming = false', () => {
    expect(new PiperTTSProvider().supportsStreaming).toBe(false);
  });

  // 3. Default binary path
  it('defaults binaryPath to "piper" when no option or env var is set', () => {
    delete process.env['PIPER_BIN'];
    const provider = new PiperTTSProvider();
    expect(provider.getBinaryPath()).toBe('piper');
  });

  // 4. PIPER_BIN env var
  it('reads binaryPath from PIPER_BIN env var', () => {
    process.env['PIPER_BIN'] = '/usr/local/bin/piper';
    const provider = new PiperTTSProvider();
    delete process.env['PIPER_BIN'];
    expect(provider.getBinaryPath()).toBe('/usr/local/bin/piper');
  });

  // 5. binaryPath option overrides env
  it('uses binaryPath option over PIPER_BIN env var', () => {
    process.env['PIPER_BIN'] = '/env/piper';
    const provider = new PiperTTSProvider({ binaryPath: '/opt/piper' });
    delete process.env['PIPER_BIN'];
    expect(provider.getBinaryPath()).toBe('/opt/piper');
  });

  // 6. Default model path
  it('sets a default modelPath containing .agentos/models/piper', () => {
    delete process.env['PIPER_MODEL_PATH'];
    const provider = new PiperTTSProvider();
    expect(provider.getModelPath()).toContain('en_US-lessac-medium.onnx');
  });

  // 7. PIPER_MODEL_PATH env var
  it('reads modelPath from PIPER_MODEL_PATH env var', () => {
    process.env['PIPER_MODEL_PATH'] = '/opt/models/piper.onnx';
    const provider = new PiperTTSProvider();
    delete process.env['PIPER_MODEL_PATH'];
    expect(provider.getModelPath()).toBe('/opt/models/piper.onnx');
  });

  // 8. spawn is called with correct args
  it('spawns piper with --model and --output_file - args', async () => {
    const provider = new PiperTTSProvider({
      binaryPath: '/usr/bin/piper',
      modelPath: '/models/en.onnx',
    });

    const synthPromise = provider.synthesize('hello');
    const proc = fakeProcesses[0]!;
    proc.emitSuccess(Buffer.from('RIFF....'));

    await synthPromise;

    expect(mockSpawn).toHaveBeenCalledWith('/usr/bin/piper', [
      '--model', '/models/en.onnx',
      '--output_file', '-',
    ]);
  });

  // 9. stdin.write is called with text
  it('writes text to stdin', async () => {
    const provider = new PiperTTSProvider({ binaryPath: 'piper', modelPath: '/m.onnx' });
    const synthPromise = provider.synthesize('speak this');
    fakeProcesses[0]!.emitSuccess(Buffer.from('wav'));
    await synthPromise;
    expect(fakeProcesses[0]!.stdin.write).toHaveBeenCalledWith('speak this');
  });

  // 10. stdin.end is called
  it('closes stdin after writing', async () => {
    const provider = new PiperTTSProvider({ binaryPath: 'piper', modelPath: '/m.onnx' });
    const synthPromise = provider.synthesize('text');
    fakeProcesses[0]!.emitSuccess(Buffer.from('wav'));
    await synthPromise;
    expect(fakeProcesses[0]!.stdin.end).toHaveBeenCalled();
  });

  // 11. stdout chunks are collected into audioBuffer
  it('collects multiple stdout chunks into a single audioBuffer', async () => {
    const provider = new PiperTTSProvider({ binaryPath: 'piper', modelPath: '/m.onnx' });
    const synthPromise = provider.synthesize('hello');
    const proc = fakeProcesses[0]!;
    proc.stdout.emit('data', Buffer.from([0x01, 0x02]));
    proc.stdout.emit('data', Buffer.from([0x03, 0x04]));
    proc.emit('close', 0);

    const result = await synthPromise;
    expect(result.audioBuffer).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04]));
  });

  // 12. mimeType is audio/wav
  it('returns mimeType = "audio/wav"', async () => {
    const provider = new PiperTTSProvider({ binaryPath: 'piper', modelPath: '/m.onnx' });
    const synthPromise = provider.synthesize('test');
    fakeProcesses[0]!.emitSuccess(Buffer.from('wav'));
    const result = await synthPromise;
    expect(result.mimeType).toBe('audio/wav');
  });

  // 13. cost is 0
  it('returns cost = 0', async () => {
    const provider = new PiperTTSProvider({ binaryPath: 'piper', modelPath: '/m.onnx' });
    const synthPromise = provider.synthesize('test');
    fakeProcesses[0]!.emitSuccess(Buffer.from('wav'));
    const result = await synthPromise;
    expect(result.cost).toBe(0);
  });

  // 14. Non-zero exit code rejects
  it('rejects when piper exits with non-zero code', async () => {
    const provider = new PiperTTSProvider({ binaryPath: 'piper', modelPath: '/m.onnx' });
    const synthPromise = provider.synthesize('test');
    fakeProcesses[0]!.emitError(1);
    await expect(synthPromise).rejects.toThrow('non-zero code 1');
  });

  // 15. spawn error rejects
  it('rejects when spawn emits an error event', async () => {
    const provider = new PiperTTSProvider({ binaryPath: 'no-such-binary', modelPath: '/m.onnx' });
    const synthPromise = provider.synthesize('test');
    fakeProcesses[0]!.emit('error', new Error('ENOENT'));
    await expect(synthPromise).rejects.toThrow('ENOENT');
  });

  // 16. Timeout rejects
  it('rejects when the process exceeds timeoutMs', async () => {
    vi.useFakeTimers();
    const provider = new PiperTTSProvider({
      binaryPath: 'piper',
      modelPath: '/m.onnx',
      timeoutMs: 1000,
    });
    const synthPromise = provider.synthesize('test');
    vi.advanceTimersByTime(1001);
    await expect(synthPromise).rejects.toThrow('timed out');
    vi.useRealTimers();
  });

  // 17. maxBufferBytes limit rejects
  it('rejects when stdout exceeds maxBufferBytes', async () => {
    const provider = new PiperTTSProvider({
      binaryPath: 'piper',
      modelPath: '/m.onnx',
      maxBufferBytes: 4,
    });
    const synthPromise = provider.synthesize('test');
    fakeProcesses[0]!.stdout.emit('data', Buffer.alloc(5, 0xff));
    await expect(synthPromise).rejects.toThrow('maxBufferBytes');
  });
});
