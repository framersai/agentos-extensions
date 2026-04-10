// @ts-nocheck
/**
 * @fileoverview Image generation service backed by AgentOS's shared
 * provider-agnostic image API.
 */

import { generateImage, type ImageProviderOptionBag } from '@framers/agentos';

export type ImageGenerationProvider = 'openai' | 'openrouter' | 'stability' | 'replicate';

export interface ImageGenerationConfig {
  openaiApiKey?: string;
  openrouterApiKey?: string;
  stabilityApiKey?: string;
  replicateApiToken?: string;
  defaultProvider?: ImageGenerationProvider;
  defaultModel?: string;
  defaultSize?: string;
  defaultQuality?: 'standard' | 'hd';
}

export interface GenerateImageOptions {
  prompt: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792' | '512x512' | '256x256';
  aspectRatio?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
  provider?: ImageGenerationProvider;
  model?: string;
  seed?: number;
  negativePrompt?: string;
  providerOptions?: ImageProviderOptionBag | Record<string, unknown>;
}

export interface GeneratedImage {
  url: string;
  revisedPrompt?: string;
  provider: string;
  model: string;
  size: string;
}

const PROVIDER_DOCS_URL: Record<ImageGenerationProvider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  openrouter: 'https://openrouter.ai/settings/keys',
  stability: 'https://platform.stability.ai/account/keys',
  replicate: 'https://replicate.com/account/api-tokens',
};

export class ImageGenerationService {
  private readonly config: ImageGenerationConfig;
  private initialized = false;

  constructor(config: ImageGenerationConfig) {
    this.config = config;
  }

  get hasOpenAI(): boolean {
    return !!this.config.openaiApiKey;
  }

  get hasOpenRouter(): boolean {
    return !!this.config.openrouterApiKey;
  }

  get hasStability(): boolean {
    return !!this.config.stabilityApiKey;
  }

  get hasReplicate(): boolean {
    return !!this.config.replicateApiToken;
  }

  get hasAnyProvider(): boolean {
    return this.hasOpenAI || this.hasOpenRouter || this.hasStability || this.hasReplicate;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async generateImage(options: GenerateImageOptions): Promise<GeneratedImage> {
    const provider = this.resolveProvider(options.provider);
    const apiKey = this.getApiKey(provider);
    if (!apiKey) {
      const envVar = provider === 'replicate' ? 'REPLICATE_API_TOKEN' : `${provider.toUpperCase()}_API_KEY`;
      throw new Error(
        `${envVar} is required for ${this.displayNameForProvider(provider)} image generation. `
        + `Set it in your environment or .env file. Get one at ${PROVIDER_DOCS_URL[provider]}`,
      );
    }

    const providerOptions = this.normalizeProviderOptions(provider, options);
    const model = options.model || this.config.defaultModel || this.defaultModelForProvider(provider);
    const result = await generateImage({
      model: `${provider}:${model}`,
      prompt: options.prompt,
      apiKey,
      size: options.size || this.config.defaultSize || '1024x1024',
      aspectRatio: options.aspectRatio,
      quality: options.quality || this.config.defaultQuality || 'standard',
      n: options.n,
      seed: options.seed,
      negativePrompt: options.negativePrompt,
      providerOptions,
    });

    const first = result.images[0];
    if (!first) {
      throw new Error('Image generation returned no images.');
    }

    const url = first.url || first.dataUrl || (first.base64
      ? `data:${first.mimeType || 'image/png'};base64,${first.base64}`
      : undefined);
    if (!url) {
      throw new Error('Image generation returned no image URL or image data.');
    }

    return {
      url,
      revisedPrompt: first.revisedPrompt,
      provider: result.provider,
      model: result.model,
      size: options.size || this.config.defaultSize || '1024x1024',
    };
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  private resolveProvider(provider?: ImageGenerationProvider): ImageGenerationProvider {
    if (provider) {
      return provider;
    }
    if (this.config.defaultProvider) {
      return this.config.defaultProvider;
    }
    if (this.hasOpenAI) return 'openai';
    if (this.hasOpenRouter) return 'openrouter';
    if (this.hasStability) return 'stability';
    if (this.hasReplicate) return 'replicate';
    return 'openai';
  }

  private getApiKey(provider: ImageGenerationProvider): string | undefined {
    switch (provider) {
      case 'openai':
        return this.config.openaiApiKey;
      case 'openrouter':
        return this.config.openrouterApiKey;
      case 'stability':
        return this.config.stabilityApiKey;
      case 'replicate':
        return this.config.replicateApiToken;
      default:
        return undefined;
    }
  }

  private defaultModelForProvider(provider: ImageGenerationProvider): string {
    switch (provider) {
      case 'openai':
        return 'dall-e-3';
      case 'openrouter':
        return 'google/gemini-2.5-flash-image';
      case 'stability':
        return 'stable-image-core';
      case 'replicate':
        return 'black-forest-labs/flux-schnell';
      default:
        return 'gpt-image-1';
    }
  }

  private displayNameForProvider(provider: ImageGenerationProvider): string {
    switch (provider) {
      case 'openai':
        return 'OpenAI';
      case 'openrouter':
        return 'OpenRouter';
      case 'stability':
        return 'Stability AI';
      case 'replicate':
        return 'Replicate';
      default:
        return provider;
    }
  }

  private normalizeProviderOptions(
    provider: ImageGenerationProvider,
    options: GenerateImageOptions,
  ): ImageProviderOptionBag | Record<string, unknown> | undefined {
    if (!options.providerOptions && !options.style && provider !== 'openai') {
      return undefined;
    }

    const providerOptions =
      options.providerOptions && typeof options.providerOptions === 'object' && !Array.isArray(options.providerOptions)
        ? { ...options.providerOptions }
        : undefined;

    if (provider === 'openai' && options.style) {
      const openAIOptions = {
        ...(providerOptions?.openai ?? {}),
        style: options.style,
      };
      return {
        ...(providerOptions ?? {}),
        openai: openAIOptions,
      };
    }

    if (provider === 'openai') {
      return {
        ...(providerOptions ?? {}),
        openai: {
          ...(providerOptions?.openai ?? {}),
          style: options.style ?? providerOptions?.openai?.style ?? 'vivid',
        },
      };
    }

    return providerOptions;
  }
}
