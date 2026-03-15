/**
 * @fileoverview Image generation service supporting DALL-E 3 and Stability AI.
 */

export interface ImageGenerationConfig {
  openaiApiKey?: string;
  stabilityApiKey?: string;
  defaultProvider?: 'openai' | 'stability';
  defaultSize?: string;
  defaultQuality?: 'standard' | 'hd';
}

export interface GenerateImageOptions {
  prompt: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792' | '512x512' | '256x256';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
  provider?: 'openai' | 'stability';
}

export interface GeneratedImage {
  url: string;
  revisedPrompt?: string;
  provider: string;
  model: string;
  size: string;
}

export class ImageGenerationService {
  private config: ImageGenerationConfig;
  private initialized = false;

  constructor(config: ImageGenerationConfig) {
    this.config = config;
  }

  get hasOpenAI(): boolean {
    return !!this.config.openaiApiKey;
  }

  get hasStability(): boolean {
    return !!this.config.stabilityApiKey;
  }

  get hasAnyProvider(): boolean {
    return this.hasOpenAI || this.hasStability;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async generateImage(options: GenerateImageOptions): Promise<GeneratedImage> {
    const provider = options.provider || this.config.defaultProvider || (this.hasOpenAI ? 'openai' : 'stability');

    if (provider === 'openai') {
      return this.generateWithDallE(options);
    } else if (provider === 'stability') {
      return this.generateWithStability(options);
    }

    throw new Error(`Unknown provider: ${provider}. Supported: openai, stability`);
  }

  private async generateWithDallE(options: GenerateImageOptions): Promise<GeneratedImage> {
    if (!this.config.openaiApiKey) {
      throw new Error(
        'OPENAI_API_KEY is required for DALL-E image generation. ' +
        'Set it in your environment or .env file. Get one at https://platform.openai.com/api-keys'
      );
    }

    const size = options.size || this.config.defaultSize || '1024x1024';
    const quality = options.quality || this.config.defaultQuality || 'standard';

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: options.prompt,
        n: 1,
        size,
        quality,
        style: options.style || 'vivid',
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const msg = (error as any)?.error?.message || response.statusText;
      throw new Error(`DALL-E API error (${response.status}): ${msg}`);
    }

    const data = await response.json() as {
      data: Array<{ url: string; revised_prompt?: string }>;
    };

    const image = data.data[0];
    if (!image?.url) {
      throw new Error('DALL-E returned no image data');
    }

    return {
      url: image.url,
      revisedPrompt: image.revised_prompt,
      provider: 'openai',
      model: 'dall-e-3',
      size,
    };
  }

  private async generateWithStability(options: GenerateImageOptions): Promise<GeneratedImage> {
    if (!this.config.stabilityApiKey) {
      throw new Error(
        'STABILITY_API_KEY is required for Stability AI image generation. ' +
        'Set it in your environment or .env file. Get one at https://platform.stability.ai/account/keys'
      );
    }

    const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.stabilityApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        text_prompts: [{ text: options.prompt, weight: 1 }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        steps: 30,
        samples: 1,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const msg = (error as any)?.message || response.statusText;
      throw new Error(`Stability AI error (${response.status}): ${msg}`);
    }

    const data = await response.json() as {
      artifacts: Array<{ base64: string; finishReason: string }>;
    };

    const artifact = data.artifacts[0];
    if (!artifact?.base64) {
      throw new Error('Stability AI returned no image data');
    }

    return {
      url: `data:image/png;base64,${artifact.base64}`,
      provider: 'stability',
      model: 'sdxl-1.0',
      size: '1024x1024',
    };
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }
}
