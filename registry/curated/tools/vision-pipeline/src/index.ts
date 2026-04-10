// @ts-nocheck
/**
 * @fileoverview Vision & OCR Pipeline Extension Pack — progressive multi-tier
 * vision pipeline as an agent tool.
 *
 * This is a minimal stub pack. The actual vision pipeline implementation is
 * provided by the core AgentOS vision module; this extension pack registers
 * the tool descriptor so the agent can discover and invoke it.
 *
 * Pipeline tiers:
 *   Tier 1 (local, fast):   PaddleOCR for printed text
 *   Tier 2 (local, medium): TrOCR for handwriting, Florence-2 for layout
 *   Tier 3 (cloud, slow):   GPT-4o / Claude vision for complex understanding
 *
 * CLIP embeddings are generated alongside any tier for semantic image search.
 *
 * @module @framers/agentos-ext-vision-pipeline
 */

/* ------------------------------------------------------------------ */
/*  Extension pack types                                               */
/* ------------------------------------------------------------------ */

export interface ExtensionContext {
  options?: Record<string, unknown>;
  secrets?: Record<string, string>;
  getSecret?: (key: string) => string | undefined;
  logger?: { info: (msg: string) => void };
}

export interface ExtensionPack {
  name: string;
  version: string;
  descriptors: Array<{
    id: string;
    kind: string;
    priority?: number;
    payload: unknown;
    requiredSecrets?: Array<{ id: string; optional?: boolean }>;
  }>;
  onActivate?: () => Promise<void>;
  onDeactivate?: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Stub tool definition                                               */
/* ------------------------------------------------------------------ */

/**
 * Stub tool for the vision & OCR pipeline.
 * Implementation is resolved at runtime by the AgentOS vision module.
 */
const visionPipelineTool = {
  name: 'vision-pipeline',
  description:
    'Extract text, understand layout, and generate embeddings from images using a progressive pipeline: PaddleOCR -> TrOCR/Florence-2 -> GPT-4o/Claude vision.',
  parameters: {
    type: 'object' as const,
    properties: {
      imageUrl: {
        type: 'string',
        description: 'URL or local path of the image to analyze',
      },
      mode: {
        type: 'string',
        enum: ['ocr', 'handwriting', 'layout', 'describe', 'embed', 'auto'],
        description:
          'Analysis mode — "ocr" for printed text, "handwriting" for handwritten text, "layout" for document structure, "describe" for general image understanding, "embed" for CLIP vector, "auto" to let the pipeline decide (default: auto)',
      },
      maxTier: {
        type: 'number',
        enum: [1, 2, 3],
        description:
          'Maximum pipeline tier to use — 1 (local OCR only), 2 (local vision models), 3 (cloud vision). Default: 3',
      },
      language: {
        type: 'string',
        description: 'Language hint for OCR (e.g. "en", "zh", "ja"). Default: "en"',
      },
    },
    required: ['imageUrl'],
  },
  execute: async () => {
    throw new Error('vision-pipeline stub — wire to VisionPipelineService at runtime.');
  },
};

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

/**
 * Create the Vision & OCR Pipeline extension pack.
 *
 * Registers the vision-pipeline tool. Actual implementation is provided
 * by the core AgentOS vision module and wired at runtime.
 */
export function createExtensionPack(context: ExtensionContext): ExtensionPack {
  return {
    name: '@framers/agentos-ext-vision-pipeline',
    version: '0.1.0',
    descriptors: [
      {
        id: visionPipelineTool.name,
        kind: 'tool' as const,
        priority: 45,
        payload: visionPipelineTool,
        requiredSecrets: [{ id: 'openai.apiKey', optional: true }],
      },
    ],
    onActivate: async () => context.logger?.info('Vision & OCR Pipeline Extension activated'),
    onDeactivate: async () => context.logger?.info('Vision & OCR Pipeline Extension deactivated'),
  };
}

export default createExtensionPack;
