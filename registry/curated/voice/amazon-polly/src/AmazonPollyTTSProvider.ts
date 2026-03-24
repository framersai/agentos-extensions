/**
 * @file AmazonPollyTTSProvider.ts
 * @description Text-to-speech provider backed by Amazon Polly Neural engine.
 *
 * The provider uses the AWS SDK v3 `@aws-sdk/client-polly` package, which is
 * declared as a peer dependency so it is only loaded at runtime.
 *
 * Audio is synthesised in MP3 format using the Neural engine.  The response
 * `AudioStream` (a `ReadableStream` in Node 18+) is fully collected into a
 * `Buffer` before being returned to the caller.
 *
 * @module amazon-polly
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PollyClient = any;

/**
 * Constructor options for {@link AmazonPollyTTSProvider}.
 */
export interface AmazonPollyCredentials {
  /** AWS IAM access key ID. */
  accessKeyId: string;
  /** AWS IAM secret access key. */
  secretAccessKey: string;
  /**
   * AWS region where the Polly endpoint lives.
   * @defaultValue `'us-east-1'`
   */
  region?: string;
}

/**
 * A voice available on Amazon Polly.
 *
 * Mirrors the generic `SpeechVoice` shape used across the AgentOS voice pipeline.
 */
export interface SpeechVoice {
  /** Provider-specific voice identifier (e.g. `'Joanna'`). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Primary BCP-47 language code supported by this voice. */
  languageCode: string;
  /** Biological gender label from the API (`'Male'`, `'Female'`). */
  gender?: string;
}

/**
 * Synthesised audio returned by {@link AmazonPollyTTSProvider.synthesize}.
 */
export interface SynthesisResult {
  /** Raw MP3 audio bytes. */
  audioBuffer: Buffer;
  /** MIME type of the audio data. Always `'audio/mpeg'` for this provider. */
  mimeType: 'audio/mpeg';
  /** Billable cost of the request (placeholder — always 0). */
  cost: number;
}

/**
 * Per-call synthesis options forwarded to the Amazon Polly API.
 */
export interface AmazonPollyTTSOptions {
  /**
   * Polly VoiceId (e.g. `'Joanna'`, `'Matthew'`).
   * @defaultValue `'Joanna'`
   * @see {@link https://docs.aws.amazon.com/polly/latest/dg/voicelist.html}
   */
  voice?: string;
}

/**
 * Amazon Polly text-to-speech provider.
 *
 * Implements the `TextToSpeechProvider` contract expected by the AgentOS voice
 * pipeline without taking a hard runtime dependency on the interface types.
 */
export class AmazonPollyTTSProvider {
  /** Stable provider identifier used by the AgentOS extension registry. */
  readonly id = 'amazon-polly';

  /** Lazily initialised Polly client. */
  private _client: PollyClient | null = null;

  /** Client configuration stored for lazy initialisation. */
  private readonly _config: Required<AmazonPollyCredentials>;

  /**
   * Create a new {@link AmazonPollyTTSProvider}.
   *
   * @param credentials - AWS credentials and optional region.
   */
  constructor(credentials: AmazonPollyCredentials) {
    this._config = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      region: credentials.region ?? 'us-east-1',
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Lazily create and return the `PollyClient` instance.
   */
  private async _getClient(): Promise<PollyClient> {
    if (!this._client) {
      const { PollyClient } = await import('@aws-sdk/client-polly');
      this._client = new PollyClient({
        region: this._config.region,
        credentials: {
          accessKeyId: this._config.accessKeyId,
          secretAccessKey: this._config.secretAccessKey,
        },
      });
    }
    return this._client;
  }

  /**
   * Drain a Node.js `Readable` or a WHATWG `ReadableStream` into a `Buffer`.
   *
   * Amazon Polly v3 returns the audio stream as a `Readable` in Node
   * environments.  This helper handles both the Node stream API and the
   * WHATWG `ReadableStream` API (for edge runtimes).
   *
   * @param stream - The audio stream from the Polly response.
   * @returns A `Buffer` containing the full audio payload.
   */
  private async _collectStream(stream: unknown): Promise<Buffer> {
    // Node.js Readable (most common in server environments)
    if (
      stream !== null &&
      typeof stream === 'object' &&
      typeof (stream as { on?: unknown }).on === 'function'
    ) {
      return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const readable = stream as NodeJS.ReadableStream;
        readable.on('data', (chunk: Buffer) => chunks.push(chunk));
        readable.on('end', () => resolve(Buffer.concat(chunks)));
        readable.on('error', reject);
      });
    }

    // WHATWG ReadableStream (edge runtimes)
    if (
      stream !== null &&
      typeof stream === 'object' &&
      typeof (stream as { getReader?: unknown }).getReader === 'function'
    ) {
      const reader = (stream as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks);
    }

    throw new TypeError('Unsupported AudioStream type returned by Polly');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Synthesise text to MP3 audio using Amazon Polly Neural engine.
   *
   * @param text    - Plain text to synthesise.
   * @param options - Optional per-call parameters (voice ID).
   * @returns {@link SynthesisResult} containing the raw MP3 buffer.
   */
  async synthesize(text: string, options?: AmazonPollyTTSOptions): Promise<SynthesisResult> {
    const client = await this._getClient();

    const { SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly');
    const response = await client.send(
      new SynthesizeSpeechCommand({
        Engine: 'neural',
        OutputFormat: 'mp3',
        Text: text,
        VoiceId: options?.voice ?? 'Joanna',
      }),
    );

    const audioBuffer = await this._collectStream(response.AudioStream);

    return {
      audioBuffer,
      mimeType: 'audio/mpeg',
      cost: 0,
    };
  }

  /**
   * List all voices available on Amazon Polly.
   *
   * @returns Array of {@link SpeechVoice} objects.
   */
  async listAvailableVoices(): Promise<SpeechVoice[]> {
    const client = await this._getClient();

    const { DescribeVoicesCommand } = await import('@aws-sdk/client-polly');
    const response = await client.send(new DescribeVoicesCommand({}));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (response.Voices ?? []).map((v: any) => ({
      id: v.Id ?? '',
      name: v.Name ?? '',
      languageCode: v.LanguageCode ?? '',
      gender: v.Gender ?? undefined,
    }));
  }
}
