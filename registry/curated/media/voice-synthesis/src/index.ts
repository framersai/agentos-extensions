/**
 * Voice Synthesis Extension Pack — TTS + STT voice tools for agents.
 *
 * Supports: OpenAI TTS/STT, ElevenLabs TTS, Ollama (local TTS).
 * Auto-detects available provider from API keys.
 */

import { TextToSpeechTool, type TTSConfig, type TTSProvider } from './tools/textToSpeech.js';
import { SpeechToTextTool, type STTConfig, type STTProvider } from './tools/speechToText.js';

export interface VoiceSynthesisExtensionOptions {
  elevenLabsApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  deepgramApiKey?: string;
  deepgramBaseUrl?: string;
  ollamaBaseUrl?: string;
  whisperLocalBaseUrl?: string;
  defaultProvider?: TTSProvider;
  defaultSttProvider?: STTProvider;
  priority?: number;
}

export function createExtensionPack(context: any) {
  const options = (context.options || {}) as VoiceSynthesisExtensionOptions;

  const config: TTSConfig = {
    openaiApiKey: options.openaiApiKey || context.getSecret?.('openai.apiKey') || process.env.OPENAI_API_KEY,
    openaiBaseUrl: options.openaiBaseUrl || process.env.OPENAI_BASE_URL,
    elevenLabsApiKey: options.elevenLabsApiKey || context.getSecret?.('elevenlabs.apiKey') || process.env.ELEVENLABS_API_KEY,
    ollamaBaseUrl: options.ollamaBaseUrl || process.env.OLLAMA_BASE_URL,
    defaultProvider: options.defaultProvider || (process.env.TTS_PROVIDER as TTSProvider) || 'auto',
  };
  const sttConfig: STTConfig = {
    openaiApiKey: options.openaiApiKey || context.getSecret?.('openai.apiKey') || process.env.OPENAI_API_KEY,
    openaiBaseUrl: options.openaiBaseUrl || process.env.OPENAI_BASE_URL,
    deepgramApiKey: options.deepgramApiKey || context.getSecret?.('deepgram.apiKey') || process.env.DEEPGRAM_API_KEY,
    deepgramBaseUrl: options.deepgramBaseUrl || process.env.DEEPGRAM_BASE_URL,
    whisperLocalBaseUrl: options.whisperLocalBaseUrl || process.env.WHISPER_LOCAL_BASE_URL,
    defaultProvider: options.defaultSttProvider || (process.env.STT_PROVIDER as STTProvider) || 'auto',
  };

  const ttsTool = new TextToSpeechTool(config);
  const sttTool = new SpeechToTextTool(sttConfig);

  const providers: string[] = [];
  if (config.openaiApiKey) providers.push('OpenAI');
  if (config.elevenLabsApiKey) providers.push('ElevenLabs');
  providers.push('Ollama (local fallback)');
  const sttProviders: string[] = [];
  if (sttConfig.openaiApiKey) sttProviders.push('OpenAI Whisper');
  if (sttConfig.deepgramApiKey) sttProviders.push('Deepgram');
  if (sttConfig.whisperLocalBaseUrl) sttProviders.push('Whisper-local');

  const features: string[] = [
    `TTS: ${providers.join(', ')}`,
    `STT: ${sttProviders.length > 0 ? sttProviders.join(', ') : 'not configured'}`,
  ];

  return {
    name: '@framers/agentos-ext-voice-synthesis',
    version: '2.0.0',
    descriptors: [
      {
        id: ttsTool.name,
        kind: 'tool' as const,
        priority: options.priority || 50,
        payload: ttsTool,
        requiredSecrets: [],
      },
      {
        id: sttTool.name,
        kind: 'tool' as const,
        priority: options.priority || 50,
        payload: sttTool,
        requiredSecrets: [],
      },
    ],
    onActivate: async () => {
      context.logger?.info?.(`Voice Synthesis activated — ${features.join(' | ')}`);
    },
    onDeactivate: async () => {
      context.logger?.info?.('Voice Synthesis deactivated');
    },
  };
}

export { TextToSpeechTool };
export { SpeechToTextTool };
export type { TTSInput, TTSOutput, TTSConfig, TTSProvider } from './tools/textToSpeech.js';
export type { STTInput, STTOutput, STTConfig, STTProvider } from './tools/speechToText.js';
export default createExtensionPack;
