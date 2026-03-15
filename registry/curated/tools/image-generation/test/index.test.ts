/**
 * @fileoverview Tests for ImageGenerationService and GenerateImageTool.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImageGenerationService, type GenerateImageOptions } from '../src/ImageGenerationService.js';
import { GenerateImageTool } from '../src/tools/generateImage.js';

// ── Mock global fetch ───────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  vi.restoreAllMocks();
  mockFetch.mockReset();
});

// ── ImageGenerationService ──────────────────────────────────────────────

describe('ImageGenerationService', () => {
  describe('provider detection', () => {
    it('hasOpenAI is true when openaiApiKey is set', () => {
      const service = new ImageGenerationService({ openaiApiKey: 'sk-test' });
      expect(service.hasOpenAI).toBe(true);
      expect(service.hasStability).toBe(false);
      expect(service.hasAnyProvider).toBe(true);
    });

    it('hasStability is true when stabilityApiKey is set', () => {
      const service = new ImageGenerationService({ stabilityApiKey: 'sk-stab-test' });
      expect(service.hasOpenAI).toBe(false);
      expect(service.hasStability).toBe(true);
      expect(service.hasAnyProvider).toBe(true);
    });

    it('hasAnyProvider is false when no keys configured', () => {
      const service = new ImageGenerationService({});
      expect(service.hasAnyProvider).toBe(false);
    });
  });

  describe('generateImage with OpenAI (DALL-E 3)', () => {
    let service: ImageGenerationService;

    beforeEach(() => {
      service = new ImageGenerationService({
        openaiApiKey: 'sk-test-openai-key',
        defaultProvider: 'openai',
      });
    });

    it('calls DALL-E 3 API and returns generated image', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              url: 'https://cdn.openai.com/generated/image123.png',
              revised_prompt: 'A majestic mountain at sunset, photorealistic',
            },
          ],
        }),
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

      // Verify fetch was called with correct params
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/images/generations');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer sk-test-openai-key');
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body.model).toBe('dall-e-3');
      expect(body.prompt).toBe('A mountain at sunset');
      expect(body.size).toBe('1024x1024');
      expect(body.quality).toBe('hd');
      expect(body.style).toBe('natural');
      expect(body.response_format).toBe('url');
    });

    it('uses default size/quality/style when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ url: 'https://cdn.openai.com/img.png' }],
        }),
      });

      await service.generateImage({ prompt: 'test prompt' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe('1024x1024');
      expect(body.quality).toBe('standard');
      expect(body.style).toBe('vivid');
    });

    it('throws on API error with descriptive message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: { message: 'Invalid prompt: content policy violation' },
        }),
      });

      await expect(service.generateImage({ prompt: 'bad prompt' })).rejects.toThrow(
        'DALL-E API error (400): Invalid prompt: content policy violation',
      );
    });

    it('throws when DALL-E returns no image data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{}] }),
      });

      await expect(service.generateImage({ prompt: 'test' })).rejects.toThrow(
        'DALL-E returned no image data',
      );
    });
  });

  describe('generateImage with Stability AI', () => {
    let service: ImageGenerationService;

    beforeEach(() => {
      service = new ImageGenerationService({
        stabilityApiKey: 'sk-stab-test-key',
        defaultProvider: 'stability',
      });
    });

    it('calls Stability API and returns base64 image', async () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAA==';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          artifacts: [
            { base64: base64Image, finishReason: 'SUCCESS' },
          ],
        }),
      });

      const result = await service.generateImage({
        prompt: 'A futuristic city',
        provider: 'stability',
      });

      expect(result.url).toBe(`data:image/png;base64,${base64Image}`);
      expect(result.provider).toBe('stability');
      expect(result.model).toBe('sdxl-1.0');
      expect(result.size).toBe('1024x1024');

      // Verify Stability API call
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('api.stability.ai');
      expect(url).toContain('stable-diffusion-xl-1024-v1-0');
      expect(opts.headers['Authorization']).toBe('Bearer sk-stab-test-key');
      expect(opts.headers['Accept']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body.text_prompts[0].text).toBe('A futuristic city');
      expect(body.text_prompts[0].weight).toBe(1);
      expect(body.cfg_scale).toBe(7);
      expect(body.steps).toBe(30);
    });

    it('throws on Stability API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Invalid API key' }),
      });

      await expect(
        service.generateImage({ prompt: 'test', provider: 'stability' }),
      ).rejects.toThrow('Stability AI error (403): Invalid API key');
    });
  });

  describe('error when no API key configured', () => {
    it('throws with OPENAI_API_KEY guidance when openai provider used without key', async () => {
      const service = new ImageGenerationService({});

      await expect(
        service.generateImage({ prompt: 'test', provider: 'openai' }),
      ).rejects.toThrow('OPENAI_API_KEY is required');
    });

    it('throws with STABILITY_API_KEY guidance when stability provider used without key', async () => {
      const service = new ImageGenerationService({});

      await expect(
        service.generateImage({ prompt: 'test', provider: 'stability' }),
      ).rejects.toThrow('STABILITY_API_KEY is required');
    });

    it('error message includes URL for obtaining key (OpenAI)', async () => {
      const service = new ImageGenerationService({});

      await expect(
        service.generateImage({ prompt: 'test', provider: 'openai' }),
      ).rejects.toThrow('https://platform.openai.com/api-keys');
    });

    it('error message includes URL for obtaining key (Stability)', async () => {
      const service = new ImageGenerationService({});

      await expect(
        service.generateImage({ prompt: 'test', provider: 'stability' }),
      ).rejects.toThrow('https://platform.stability.ai/account/keys');
    });
  });

  describe('initialize / shutdown', () => {
    it('initialize and shutdown complete without error', async () => {
      const service = new ImageGenerationService({});
      await expect(service.initialize()).resolves.toBeUndefined();
      await expect(service.shutdown()).resolves.toBeUndefined();
    });
  });
});

// ── GenerateImageTool ───────────────────────────────────────────────────

describe('GenerateImageTool', () => {
  it('has correct metadata', () => {
    const service = new ImageGenerationService({});
    const tool = new GenerateImageTool(service);
    expect(tool.id).toBe('tool.generate_image');
    expect(tool.name).toBe('generate_image');
    expect(tool.category).toBe('media');
    expect(tool.inputSchema.required).toContain('prompt');
  });

  it('execute() returns success with URL on successful generation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            url: 'https://cdn.openai.com/result.png',
            revised_prompt: 'Enhanced prompt',
          },
        ],
      }),
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
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ error: { message: 'Rate limit exceeded' } }),
    });

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
    expect((result.details as any).apiKeyGuidance).toContain('API_KEY');
  });
});
