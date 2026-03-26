import type {
  ExtensionPackContext,
  ExtensionPack,
  ExtensionLifecycleContext,
} from '@framers/agentos';

import { ImageGenerationService } from './ImageGenerationService.js';
import { GenerateImageTool } from './tools/generateImage.js';

export interface ImageGenerationOptions {
  openaiApiKey?: string;
  openrouterApiKey?: string;
  stabilityApiKey?: string;
  replicateApiToken?: string;
  defaultProvider?: 'openai' | 'openrouter' | 'stability' | 'replicate';
  defaultModel?: string;
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

  const openrouterApiKey =
    options.openrouterApiKey ||
    context.getSecret?.('openrouter.apiKey') ||
    process.env.OPENROUTER_API_KEY;

  const stabilityApiKey =
    options.stabilityApiKey ||
    context.getSecret?.('stability.apiKey') ||
    process.env.STABILITY_API_KEY;

  const replicateApiToken =
    options.replicateApiToken ||
    context.getSecret?.('replicate.apiToken') ||
    process.env.REPLICATE_API_TOKEN;

  const service = new ImageGenerationService({
    openaiApiKey,
    openrouterApiKey,
    stabilityApiKey,
    replicateApiToken,
    defaultProvider: options.defaultProvider,
    defaultModel: options.defaultModel,
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
          { id: 'openrouter.apiKey', optional: true },
          { id: 'stability.apiKey', optional: true },
          { id: 'replicate.apiToken', optional: true },
        ],
      },
    ],
    onActivate: async (lc?: ExtensionLifecycleContext) => {
      await service.initialize();
      const providers: string[] = [];
      if (service.hasOpenAI) providers.push('OpenAI');
      if (service.hasOpenRouter) providers.push('OpenRouter');
      if (service.hasStability) providers.push('Stability AI');
      if (service.hasReplicate) providers.push('Replicate');
      const status = providers.length > 0
        ? providers.join(' + ')
        : 'no API keys configured (set OPENAI_API_KEY, OPENROUTER_API_KEY, STABILITY_API_KEY, or REPLICATE_API_TOKEN)';
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
