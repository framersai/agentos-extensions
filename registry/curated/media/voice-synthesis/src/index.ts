/**
 * Voice Synthesis Extension Pack — multi-provider TTS for agents.
 *
 * Supports: OpenAI TTS, ElevenLabs, Ollama (local).
 * Auto-detects available provider from API keys.
 */

import { TextToSpeechTool, type TTSConfig, type TTSProvider } from './tools/textToSpeech.js';

export interface VoiceSynthesisExtensionOptions {
  elevenLabsApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  ollamaBaseUrl?: string;
  defaultProvider?: TTSProvider;
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

  const tool = new TextToSpeechTool(config);

  // Determine which providers are available for the activation message
  const providers: string[] = [];
  if (config.openaiApiKey) providers.push('OpenAI');
  if (config.elevenLabsApiKey) providers.push('ElevenLabs');
  providers.push('Ollama (local fallback)');

  return {
    name: '@framers/agentos-ext-voice-synthesis',
    version: '2.0.0',
    descriptors: [
      {
        id: tool.name,
        kind: 'tool' as const,
        priority: options.priority || 50,
        payload: tool,
        requiredSecrets: [],
      },
    ],
    onActivate: async () => {
      context.logger?.info?.(`Voice Synthesis activated — providers: ${providers.join(', ')}`);
    },
    onDeactivate: async () => {
      context.logger?.info?.('Voice Synthesis deactivated');
    },
  };
}

export { TextToSpeechTool };
export type { TTSInput, TTSOutput, TTSConfig, TTSProvider } from './tools/textToSpeech.js';
export default createExtensionPack;
