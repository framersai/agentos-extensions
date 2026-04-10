// @ts-nocheck
/**
 * @fileoverview Tests for ImageGenerationService and GenerateImageTool.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageGenerationService } from '../src/ImageGenerationService.js';
import { GenerateImageTool } from '../src/tools/generateImage.js';

const { mockGenerateImage } = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(),
}));

vi.mock('@framers/agentos', () => ({
  generateImage: mockGenerateImage,
}));

describe('ImageGenerationService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockGenerateImage.mockReset();
  });

  it('detects configured providers', () => {
    const service = new ImageGenerationService({
      openaiApiKey: 'sk-openai',
      openrouterApiKey: 'sk-openrouter',
      stabilityApiKey: 'sk-stability',
      replicateApiToken: 'r8-token',
    });

    expect(service.hasOpenAI).toBe(true);
    expect(service.hasOpenRouter).toBe(true);
    expect(service.hasStability).toBe(true);
    expect(service.hasReplicate).toBe(true);
    expect(service.hasAnyProvider).toBe(true);
  });

  it('routes OpenAI generation through the shared high-level image API', async () => {
    mockGenerateImage.mockResolvedValue({
      provider: 'openai',
      model: 'dall-e-3',
      created: 123,
      images: [
        {
          url: 'https://cdn.openai.com/generated/image123.png',
          revisedPrompt: 'A majestic mountain at sunset, photorealistic',
        },
      ],
    });

    const service = new ImageGenerationService({
      openaiApiKey: 'sk-test-openai-key',
      defaultProvider: 'openai',
    });

    const result = await service.generateImage({
      prompt: 'A mountain at sunset',
      size: '1024x1024',
      quality: 'hd',
      style: 'natural',
    });

    expect(result.url).toBe('https://cdn.openai.com/generated/image123.png');
    expect(result.revisedPrompt).toBe('A majestic mountain at sunset, photorealistic');
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('dall-e-3');
    expect(result.size).toBe('1024x1024');

    expect(mockGenerateImage).toHaveBeenCalledWith({
      model: 'openai:dall-e-3',
      prompt: 'A mountain at sunset',
      apiKey: 'sk-test-openai-key',
      size: '1024x1024',
      aspectRatio: undefined,
      quality: 'hd',
      n: undefined,
      seed: undefined,
      negativePrompt: undefined,
      providerOptions: {
        openai: {
          style: 'natural',
        },
      },
    });
  });

  it('routes Stability generation through the shared high-level image API', async () => {
    mockGenerateImage.mockResolvedValue({
      provider: 'stability',
      model: 'sd3-large',
      created: 456,
      images: [
        {
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAA==',
        },
      ],
    });

    const service = new ImageGenerationService({
      stabilityApiKey: 'sk-stab-test-key',
      defaultProvider: 'stability',
    });

    const result = await service.generateImage({
      prompt: 'A futuristic city',
      provider: 'stability',
      negativePrompt: 'blurry',
      providerOptions: {
        stability: {
          engine: 'sd3-large',
          stylePreset: 'photographic',
          seed: 77,
        },
      },
    });

    expect(result.url).toContain('data:image/png;base64,');
    expect(result.provider).toBe('stability');
    expect(result.model).toBe('sd3-large');
    expect(mockGenerateImage).toHaveBeenCalledWith({
      model: 'stability:stable-image-core',
      prompt: 'A futuristic city',
      apiKey: 'sk-stab-test-key',
      size: '1024x1024',
      aspectRatio: undefined,
      quality: 'standard',
      n: undefined,
      seed: undefined,
      negativePrompt: 'blurry',
      providerOptions: {
        stability: {
          engine: 'sd3-large',
          stylePreset: 'photographic',
          seed: 77,
        },
      },
    });
  });

  it('throws helpful API key guidance when a provider is selected without credentials', async () => {
    const service = new ImageGenerationService({});

    await expect(service.generateImage({ prompt: 'test', provider: 'openai' })).rejects.toThrow(
      'https://platform.openai.com/api-keys',
    );
    await expect(service.generateImage({ prompt: 'test', provider: 'stability' })).rejects.toThrow(
      'https://platform.stability.ai/account/keys',
    );
    await expect(service.generateImage({ prompt: 'test', provider: 'replicate' })).rejects.toThrow(
      'https://replicate.com/account/api-tokens',
    );
  });
});

describe('GenerateImageTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockGenerateImage.mockReset();
  });

  it('has correct metadata', () => {
    const service = new ImageGenerationService({});
    const tool = new GenerateImageTool(service);
    expect(tool.id).toBe('tool.generate_image');
    expect(tool.name).toBe('generate_image');
    expect(tool.category).toBe('media');
    expect(tool.inputSchema.required).toContain('prompt');
  });

  it('execute() returns success with URL on successful generation', async () => {
    mockGenerateImage.mockResolvedValue({
      provider: 'openai',
      model: 'dall-e-3',
      created: 123,
      images: [
        {
          url: 'https://cdn.openai.com/result.png',
          revisedPrompt: 'Enhanced prompt',
        },
      ],
    });

    const service = new ImageGenerationService({ openaiApiKey: 'sk-test' });
    const tool = new GenerateImageTool(service);

    const result = await tool.execute({ prompt: 'A cat wearing a hat' });

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.url).toBe('https://cdn.openai.com/result.png');
    expect(result.output!.revisedPrompt).toBe('Enhanced prompt');
    expect(result.output!.provider).toBe('openai');
    expect(result.output!.model).toBe('dall-e-3');
  });

  it('execute() returns failure with error message on API error', async () => {
    mockGenerateImage.mockRejectedValue(new Error('Rate limit exceeded'));

    const service = new ImageGenerationService({ openaiApiKey: 'sk-test' });
    const tool = new GenerateImageTool(service);

    const result = await tool.execute({ prompt: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limit exceeded');
  });

  it('execute() returns apiKeyGuidance in details when API key missing', async () => {
    const service = new ImageGenerationService({});
    const tool = new GenerateImageTool(service);

    const result = await tool.execute({ prompt: 'test', provider: 'openai' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('OPENAI_API_KEY');
    expect(result.details).toBeDefined();
    expect((result.details as Record<string, unknown>).apiKeyGuidance).toBeDefined();
  });
});
