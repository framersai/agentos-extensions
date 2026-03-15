import type {
  ExtensionPackContext,
  ExtensionPack,
  ExtensionLifecycleContext,
} from '@framers/agentos';

import { ImageGenerationService } from './ImageGenerationService.js';
import { GenerateImageTool } from './tools/generateImage.js';

export interface ImageGenerationOptions {
  openaiApiKey?: string;
  stabilityApiKey?: string;
  defaultProvider?: 'openai' | 'stability';
  defaultSize?: string;
  defaultQuality?: 'standard' | 'hd';
  priority?: number;
}

export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const options = (context.options ?? {}) as ImageGenerationOptions;

  const openaiApiKey =
    options.openaiApiKey ||
    context.getSecret?.('openai.apiKey') ||
    process.env.OPENAI_API_KEY;

  const stabilityApiKey =
    options.stabilityApiKey ||
    context.getSecret?.('stability.apiKey') ||
    process.env.STABILITY_API_KEY;

  const service = new ImageGenerationService({
    openaiApiKey,
    stabilityApiKey,
    defaultProvider: options.defaultProvider,
    defaultSize: options.defaultSize,
    defaultQuality: options.defaultQuality,
  });

  const tool = new GenerateImageTool(service);

  return {
    name: '@framers/agentos-ext-image-generation',
    version: '1.0.0',
    descriptors: [
      {
        id: tool.name,
        kind: 'tool',
        priority: options.priority ?? 50,
        payload: tool,
        requiredSecrets: [
          { id: 'openai.apiKey', optional: true },
          { id: 'stability.apiKey', optional: true },
        ],
      },
    ],
    onActivate: async (lc?: ExtensionLifecycleContext) => {
      await service.initialize();
      const providers: string[] = [];
      if (service.hasOpenAI) providers.push('DALL-E 3');
      if (service.hasStability) providers.push('Stability AI');
      const status = providers.length > 0
        ? providers.join(' + ')
        : 'no API keys configured (set OPENAI_API_KEY or STABILITY_API_KEY)';
      lc?.logger?.info(`Image Generation Extension activated — ${status}`);
    },
    onDeactivate: async (lc?: ExtensionLifecycleContext) => {
      await service.shutdown();
      lc?.logger?.info('Image Generation Extension deactivated');
    },
  };
}

export { ImageGenerationService } from './ImageGenerationService.js';
export { GenerateImageTool } from './tools/generateImage.js';
export default createExtensionPack;
