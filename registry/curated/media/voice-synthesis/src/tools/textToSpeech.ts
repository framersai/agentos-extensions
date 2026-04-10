// @ts-nocheck
/**
 * Multi-provider TTS Tool — text-to-speech synthesis.
 *
 * Supports: OpenAI TTS, ElevenLabs, Ollama (local), any OpenAI-compatible TTS API.
 * Auto-detects available provider from API keys in environment.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult, JSONSchemaObject } from '@framers/agentos';

export type TTSProvider = 'openai' | 'elevenlabs' | 'ollama' | 'auto';

export interface TTSInput {
  text: string;
  voice?: string;
  model?: string;
  provider?: TTSProvider;
  /** ElevenLabs-specific */
  stability?: number;
  /** ElevenLabs-specific */
  similarity_boost?: number;
  /** OpenAI-specific: speed 0.25-4.0 */
  speed?: number;
  /** Output format: mp3, opus, aac, flac, wav */
  format?: string;
}

export interface TTSOutput {
  text: string;
  voice: string;
  model: string;
  provider: string;
  audioBase64: string;
  contentType: string;
  durationEstimateMs: number;
}

// ── ElevenLabs voice name → ID mapping ──
const ELEVENLABS_VOICES: Record<string, string> = {
  rachel: '21m00Tcm4TlvDq8ikWAM',
  domi: 'AZnzlk1XvdvUeBnXmlld',
  bella: 'EXAVITQu4vr4xnSDxMaL',
  antoni: 'ErXwobaYiN019PkySvjV',
  josh: 'TxGEqnHWrfWFTfGW9XjX',
  arnold: 'VR6AewLTigWG4xSOukaG',
  adam: 'pNInz6obpgDQGcFmaJgB',
  sam: 'yoZ06aMxZJJ28mfd3POQ',
};

// ── OpenAI voice options ──
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export interface TTSConfig {
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  elevenLabsApiKey?: string;
  ollamaBaseUrl?: string;
  defaultProvider?: TTSProvider;
}

export class TextToSpeechTool implements ITool<TTSInput, TTSOutput> {
  readonly id = 'tts-multi-provider-v1';
  readonly name = 'text_to_speech';
  readonly displayName = 'Text to Speech';
  readonly description =
    'Convert text to speech audio. Supports multiple providers: OpenAI TTS (alloy/echo/fable/onyx/nova/shimmer), ' +
    'ElevenLabs (rachel/domi/bella/antoni/josh/arnold/adam/sam), or local Ollama TTS. ' +
    'Auto-detects available provider from API keys. Returns base64-encoded audio.';
  readonly category = 'media';
  readonly version = '2.0.0';
  readonly hasSideEffects = false;

  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to convert to speech. Max 5000 chars.' },
      voice: {
        type: 'string',
        description:
          'Voice name. OpenAI: alloy, echo, fable, onyx, nova (default), shimmer. ' +
          'ElevenLabs: rachel (default), domi, bella, antoni, josh, arnold, adam, sam. ' +
          'Or a custom voice ID.',
      },
      model: {
        type: 'string',
        description: 'TTS model. OpenAI: tts-1 (default), tts-1-hd. ElevenLabs: eleven_monolingual_v1 (default), eleven_multilingual_v2.',
      },
      provider: {
        type: 'string',
        enum: ['openai', 'elevenlabs', 'ollama', 'auto'],
        description: 'TTS provider. Default: auto (detects from available API keys).',
      },
      speed: { type: 'number', minimum: 0.25, maximum: 4.0, description: 'OpenAI speed multiplier (0.25-4.0).' },
      stability: { type: 'number', minimum: 0, maximum: 1, description: 'ElevenLabs voice stability (0-1).' },
      similarity_boost: { type: 'number', minimum: 0, maximum: 1, description: 'ElevenLabs similarity boost (0-1).' },
      format: { type: 'string', enum: ['mp3', 'opus', 'aac', 'flac', 'wav'], description: 'Output audio format.' },
    },
    required: ['text'],
  };

  readonly requiredCapabilities = ['capability:tts'];

  private config: TTSConfig;

  constructor(config?: TTSConfig) {
    this.config = {
      openaiApiKey: config?.openaiApiKey || process.env.OPENAI_API_KEY || '',
      openaiBaseUrl: config?.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      elevenLabsApiKey: config?.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '',
      ollamaBaseUrl: config?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      defaultProvider: config?.defaultProvider || (process.env.TTS_PROVIDER as TTSProvider) || 'auto',
    };
  }

  private resolveProvider(requested?: TTSProvider): TTSProvider | null {
    const pref = requested || this.config.defaultProvider || 'auto';
    if (pref !== 'auto') {
      // Verify the requested provider has credentials
      if (pref === 'openai' && this.config.openaiApiKey) return 'openai';
      if (pref === 'elevenlabs' && this.config.elevenLabsApiKey) return 'elevenlabs';
      if (pref === 'ollama') return 'ollama';
      // Fall through to auto if requested provider isn't configured
    }

    // Auto-detect: prefer OpenAI (cheaper, faster), then ElevenLabs, then Ollama
    if (this.config.openaiApiKey) return 'openai';
    if (this.config.elevenLabsApiKey) return 'elevenlabs';
    return 'ollama'; // Local fallback — may or may not have TTS model
  }

  async execute(args: TTSInput, _context: ToolExecutionContext): Promise<ToolExecutionResult<TTSOutput>> {
    const text = args.text.slice(0, 5000);
    const provider = this.resolveProvider(args.provider);

    if (!provider) {
      return {
        success: false,
        error:
          'No TTS provider available. Set one of: OPENAI_API_KEY, ELEVENLABS_API_KEY, or configure Ollama with a TTS model. ' +
          'Get an OpenAI key at https://platform.openai.com/api-keys or ElevenLabs at https://elevenlabs.io',
      };
    }

    try {
      switch (provider) {
        case 'openai':
          return await this.synthesizeOpenAI(text, args);
        case 'elevenlabs':
          return await this.synthesizeElevenLabs(text, args);
        case 'ollama':
          return await this.synthesizeOllama(text, args);
        default:
          return { success: false, error: `Unknown TTS provider: ${provider}` };
      }
    } catch (err: any) {
      return { success: false, error: `TTS failed (${provider}): ${err.message}` };
    }
  }

  // ── OpenAI TTS ──

  private async synthesizeOpenAI(text: string, args: TTSInput): Promise<ToolExecutionResult<TTSOutput>> {
    const voice = args.voice && OPENAI_VOICES.includes(args.voice) ? args.voice : 'nova';
    const model = args.model || 'tts-1';
    const format = args.format || 'mp3';

    const response = await fetch(`${this.config.openaiBaseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        response_format: format,
        speed: args.speed,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `OpenAI TTS error (${response.status}): ${err.slice(0, 300)}` };
    }

    const buf = await response.arrayBuffer();
    const audioBase64 = Buffer.from(buf).toString('base64');
    const contentType = format === 'opus' ? 'audio/opus' : format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const durationEstimateMs = Math.round((text.split(/\s+/).length / 150) * 60 * 1000);

    return {
      success: true,
      output: { text, voice, model, provider: 'openai', audioBase64, contentType, durationEstimateMs },
      contentType,
    };
  }

  // ── ElevenLabs TTS ──

  private async synthesizeElevenLabs(text: string, args: TTSInput): Promise<ToolExecutionResult<TTSOutput>> {
    const voiceId = ELEVENLABS_VOICES[(args.voice || 'rachel').toLowerCase()] || args.voice || ELEVENLABS_VOICES.rachel;
    const model = args.model || 'eleven_monolingual_v1';

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.config.elevenLabsApiKey!,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: args.stability ?? 0.5,
          similarity_boost: args.similarity_boost ?? 0.75,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `ElevenLabs error (${response.status}): ${err.slice(0, 300)}` };
    }

    const buf = await response.arrayBuffer();
    const audioBase64 = Buffer.from(buf).toString('base64');
    const durationEstimateMs = Math.round((text.split(/\s+/).length / 150) * 60 * 1000);

    return {
      success: true,
      output: {
        text,
        voice: args.voice || 'rachel',
        model,
        provider: 'elevenlabs',
        audioBase64,
        contentType: 'audio/mpeg',
        durationEstimateMs,
      },
      contentType: 'audio/mpeg',
    };
  }

  // ── Ollama TTS (local, experimental) ──

  private async synthesizeOllama(text: string, args: TTSInput): Promise<ToolExecutionResult<TTSOutput>> {
    // Ollama doesn't natively support TTS yet, but some models (e.g., bark, piper)
    // can be served via OpenAI-compatible endpoints. Try the OpenAI-compat path.
    const voice = args.voice || 'default';
    const model = args.model || 'tts'; // User must have a TTS model loaded

    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, voice, input: text }),
      });

      if (!response.ok) {
        return {
          success: false,
          error:
            `Ollama TTS not available (${response.status}). Ollama doesn't natively support TTS yet. ` +
            'Set OPENAI_API_KEY or ELEVENLABS_API_KEY for cloud TTS, or use a dedicated local TTS server.',
        };
      }

      const buf = await response.arrayBuffer();
      const audioBase64 = Buffer.from(buf).toString('base64');
      const durationEstimateMs = Math.round((text.split(/\s+/).length / 150) * 60 * 1000);

      return {
        success: true,
        output: { text, voice, model, provider: 'ollama', audioBase64, contentType: 'audio/mpeg', durationEstimateMs },
        contentType: 'audio/mpeg',
      };
    } catch {
      return {
        success: false,
        error:
          'Ollama TTS endpoint not reachable. Ollama doesn\'t natively support TTS yet. ' +
          'Set OPENAI_API_KEY or ELEVENLABS_API_KEY for cloud TTS.',
      };
    }
  }
}
