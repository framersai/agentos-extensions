/**
 * @fileoverview Image generation tool — generates images from text prompts
 * using the configured image provider stack.
 */

import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { ImageGenerationService, GenerateImageOptions } from '../ImageGenerationService.js';

export interface GenerateImageInput {
  prompt: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  aspectRatio?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  provider?: 'openai' | 'openrouter' | 'stability' | 'replicate';
  model?: string;
  seed?: number;
  negativePrompt?: string;
}

export interface GenerateImageOutput {
  url: string;
  revisedPrompt?: string;
  provider: string;
  model: string;
  size: string;
}

export class GenerateImageTool implements ITool<GenerateImageInput, GenerateImageOutput> {
  readonly id = 'tool.generate_image';
  readonly name = 'generate_image';
  readonly displayName = 'Generate Image';
  readonly description = 'Generate an image from a text prompt using the configured image providers. Returns a URL or data URL to the generated image.';
  readonly category = 'media';
  readonly hasSideEffects = false;

  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Detailed text description of the image to generate. Be specific about style, subject, composition, lighting, and mood.',
      },
      size: {
        type: 'string',
        enum: ['1024x1024', '1792x1024', '1024x1792'],
        description: 'Image dimensions. 1024x1024 (square, default), 1792x1024 (landscape), 1024x1792 (portrait).',
      },
      aspectRatio: {
        type: 'string',
        description: 'Optional aspect ratio hint for providers that support it, such as 1:1, 16:9, or 9:16.',
      },
      quality: {
        type: 'string',
        enum: ['standard', 'hd'],
        description: 'Image quality. "hd" produces higher detail but costs more.',
      },
      style: {
        type: 'string',
        enum: ['vivid', 'natural'],
        description: 'Style preset. "vivid" (default) for hyper-real/dramatic, "natural" for more realistic.',
      },
      provider: {
        type: 'string',
        enum: ['openai', 'openrouter', 'stability', 'replicate'],
        description: 'Which AI provider to use. If omitted, the extension uses its configured default provider.',
      },
      model: {
        type: 'string',
        description: 'Optional provider-native model id, for example gpt-image-1, stable-image-core, or black-forest-labs/flux-schnell.',
      },
      seed: {
        type: 'number',
        description: 'Optional seed for providers that support reproducible image generation.',
      },
      negativePrompt: {
        type: 'string',
        description: 'Optional negative prompt for providers that support excluding specific traits or artifacts.',
      },
    },
    required: ['prompt'],
  };

  private service: ImageGenerationService;

  constructor(service: ImageGenerationService) {
    this.service = service;
  }

  async execute(
    args: GenerateImageInput,
    _context?: ToolExecutionContext,
  ): Promise<ToolExecutionResult<GenerateImageOutput>> {
    try {
      const result = await this.service.generateImage(args as GenerateImageOptions);

      return {
        success: true,
        output: {
          url: result.url,
          revisedPrompt: result.revisedPrompt,
          provider: result.provider,
          model: result.model,
          size: result.size,
        },
        details: {
          displayText: result.revisedPrompt
            ? `Image generated (${result.model}): ${result.url}\nRevised prompt: ${result.revisedPrompt}`
            : `Image generated (${result.model}): ${result.url}`,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
        details: message.includes('API_KEY')
          ? { apiKeyGuidance: message }
          : undefined,
      };
    }
  }
}
