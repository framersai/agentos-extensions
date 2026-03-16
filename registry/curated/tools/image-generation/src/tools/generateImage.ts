/**
 * @fileoverview Image generation tool — generates images from text prompts
 * using DALL-E 3 or Stability AI.
 */

import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { ImageGenerationService, GenerateImageOptions } from '../ImageGenerationService.js';

export interface GenerateImageInput {
  prompt: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  provider?: 'openai' | 'stability';
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
  readonly description = 'Generate an image from a text prompt using DALL-E 3 or Stability AI. Returns a URL to the generated image.';
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
        enum: ['openai', 'stability'],
        description: 'Which AI provider to use. Defaults to OpenAI (DALL-E 3).',
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
