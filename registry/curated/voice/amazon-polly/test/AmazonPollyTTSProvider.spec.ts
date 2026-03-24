/**
 * @file AmazonPollyTTSProvider.spec.ts
 * @description Unit tests for {@link AmazonPollyTTSProvider}.
 *
 * The `@aws-sdk/client-polly` SDK is mocked via `vi.mock` so tests run without
 * real AWS credentials or network access.
 *
 * Architecture note: The provider dynamically imports `@aws-sdk/client-polly`
 * inside its methods (lazy import pattern for peer deps).  Vitest's module
 * mock is hoisted, so the mock takes effect even for dynamic imports within
 * the same Vite module graph.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

// ---------------------------------------------------------------------------
// Mock @aws-sdk/client-polly
// ---------------------------------------------------------------------------

/** Captured send() calls with their command instances. */
const sentCommands: unknown[] = [];

/** Fake MP3 bytes returned by the mock synthesize call. */
const FAKE_MP3 = Buffer.from([0xff, 0xfb, 0xd2, 0x00]);

/**
 * Build a Node Readable that emits FAKE_MP3 then ends.
 * This simulates the real Polly AudioStream in a Node environment.
 */
function makeMockAudioStream(): Readable {
  return Readable.from([FAKE_MP3]);
}

vi.mock('@aws-sdk/client-polly', () => {
  /** Minimal PollyClient stand-in. */
  class MockPollyClient {
    _options: unknown;

    constructor(options: unknown) {
      this._options = options;
    }

    async send(command: unknown) {
      sentCommands.push(command);

      // Determine which command was sent by its constructor name.
      const name = (command as { constructor: { name: string } }).constructor.name;

      if (name === 'SynthesizeSpeechCommand') {
        return { AudioStream: makeMockAudioStream() };
      }

      if (name === 'DescribeVoicesCommand') {
        return {
          Voices: [
            { Id: 'Joanna', Name: 'Joanna', LanguageCode: 'en-US', Gender: 'Female' },
            { Id: 'Matthew', Name: 'Matthew', LanguageCode: 'en-US', Gender: 'Male' },
            { Id: 'Lea', Name: 'Lea', LanguageCode: 'fr-FR', Gender: 'Female' },
          ],
        };
      }

      throw new Error(`Unexpected command: ${name}`);
    }
  }

  /** Minimal command classes — the provider checks constructor.name. */
  class SynthesizeSpeechCommand {
    params: unknown;
    constructor(params: unknown) { this.params = params; }
  }

  class DescribeVoicesCommand {
    params: unknown;
    constructor(params: unknown) { this.params = params; }
  }

  return { PollyClient: MockPollyClient, SynthesizeSpeechCommand, DescribeVoicesCommand };
});

// ---------------------------------------------------------------------------
// Import module under test AFTER mock
// ---------------------------------------------------------------------------

import { AmazonPollyTTSProvider } from '../src/AmazonPollyTTSProvider.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AmazonPollyTTSProvider', () => {
  beforeEach(() => {
    sentCommands.length = 0;
  });

  // 1. id
  it('exposes id = "amazon-polly"', () => {
    const provider = new AmazonPollyTTSProvider({
      accessKeyId: 'AKID',
      secretAccessKey: 'SECRET',
    });
    expect(provider.id).toBe('amazon-polly');
  });

  // 2. PollyClient receives correct credentials and default region
  it('constructs PollyClient with credentials and default region us-east-1', async () => {
    const provider = new AmazonPollyTTSProvider({
      accessKeyId: 'AKID',
      secretAccessKey: 'SECRET',
    });

    await provider.synthesize('test');

    // Access the lazily-created client through the private field.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (provider as any)._client as {
      _options: {
        region: string;
        credentials: { accessKeyId: string; secretAccessKey: string };
      };
    };

    expect(client._options.region).toBe('us-east-1');
    expect(client._options.credentials.accessKeyId).toBe('AKID');
    expect(client._options.credentials.secretAccessKey).toBe('SECRET');
  });

  // 3. Custom region
  it('forwards custom region to PollyClient', async () => {
    const provider = new AmazonPollyTTSProvider({
      accessKeyId: 'K',
      secretAccessKey: 'S',
      region: 'eu-west-1',
    });

    await provider.synthesize('test');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (provider as any)._client as { _options: { region: string } };
    expect(client._options.region).toBe('eu-west-1');
  });

  // 4. SynthesizeSpeechCommand params — defaults
  it('sends SynthesizeSpeechCommand with Engine=neural, OutputFormat=mp3, default VoiceId', async () => {
    const provider = new AmazonPollyTTSProvider({ accessKeyId: 'K', secretAccessKey: 'S' });
    await provider.synthesize('Hello Polly');

    expect(sentCommands).toHaveLength(1);
    const cmd = sentCommands[0] as { params: {
      Engine: string; OutputFormat: string; Text: string; VoiceId: string;
    } };
    expect(cmd.params.Engine).toBe('neural');
    expect(cmd.params.OutputFormat).toBe('mp3');
    expect(cmd.params.Text).toBe('Hello Polly');
    expect(cmd.params.VoiceId).toBe('Joanna');
  });

  // 5. Custom voice
  it('passes custom VoiceId when specified in options', async () => {
    const provider = new AmazonPollyTTSProvider({ accessKeyId: 'K', secretAccessKey: 'S' });
    await provider.synthesize('Hi', { voice: 'Matthew' });

    const cmd = sentCommands[0] as { params: { VoiceId: string } };
    expect(cmd.params.VoiceId).toBe('Matthew');
  });

  // 6. SynthesisResult shape
  it('returns audioBuffer, mimeType=audio/mpeg and cost=0', async () => {
    const provider = new AmazonPollyTTSProvider({ accessKeyId: 'K', secretAccessKey: 'S' });
    const result = await provider.synthesize('test');

    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.cost).toBe(0);
    expect(Buffer.isBuffer(result.audioBuffer)).toBe(true);
  });

  // 7. AudioStream collected correctly
  it('collects AudioStream into the expected bytes', async () => {
    const provider = new AmazonPollyTTSProvider({ accessKeyId: 'K', secretAccessKey: 'S' });
    const result = await provider.synthesize('test');

    expect(result.audioBuffer).toEqual(FAKE_MP3);
  });

  // 8. listAvailableVoices — count
  it('returns all voices from DescribeVoicesCommand response', async () => {
    const provider = new AmazonPollyTTSProvider({ accessKeyId: 'K', secretAccessKey: 'S' });
    const voices = await provider.listAvailableVoices();

    expect(voices).toHaveLength(3);
  });

  // 9. listAvailableVoices — voice shape
  it('maps Polly Voice fields to SpeechVoice', async () => {
    const provider = new AmazonPollyTTSProvider({ accessKeyId: 'K', secretAccessKey: 'S' });
    const voices = await provider.listAvailableVoices();

    expect(voices[0]).toEqual({
      id: 'Joanna',
      name: 'Joanna',
      languageCode: 'en-US',
      gender: 'Female',
    });
  });

  // 10. listAvailableVoices — sends DescribeVoicesCommand
  it('sends DescribeVoicesCommand when listing voices', async () => {
    const provider = new AmazonPollyTTSProvider({ accessKeyId: 'K', secretAccessKey: 'S' });
    await provider.listAvailableVoices();

    expect(sentCommands).toHaveLength(1);
    const cmd = sentCommands[0] as { constructor: { name: string } };
    expect(cmd.constructor.name).toBe('DescribeVoicesCommand');
  });
});
