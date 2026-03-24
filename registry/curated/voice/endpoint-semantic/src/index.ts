/**
 * @file index.ts
 * @description Pack factory for the Semantic Endpoint Detector extension pack.
 *
 * ### Usage (direct)
 * ```ts
 * import { createSemanticEndpointDetector } from '@framers/agentos-ext-endpoint-semantic';
 *
 * const detector = createSemanticEndpointDetector(
 *   async (prompt) => myLlm(prompt),
 *   { timeoutMs: 400, minSilenceBeforeCheckMs: 600 }
 * );
 * detector.on('turn_complete', (evt) => console.log('Turn done:', evt.reason));
 * ```
 *
 * ### Usage (manifest-driven)
 * ```json
 * { "packs": [{ "module": "@framers/agentos-ext-endpoint-semantic" }] }
 * ```
 *
 * @module endpoint-semantic
 */

import { SemanticEndpointDetector } from './SemanticEndpointDetector.js';
import type { SemanticEndpointConfig } from './types.js';

// ---------------------------------------------------------------------------
// Local types (avoid hard runtime dep on @framers/agentos)
// ---------------------------------------------------------------------------

/** Subset of ExtensionDescriptor required by this pack. */
interface ExtensionDescriptor {
  id: string;
  kind: string;
  payload: unknown;
  enableByDefault?: boolean;
  metadata?: Record<string, unknown>;
}

/** Subset of ExtensionPack required by this pack. */
interface ExtensionPack {
  id: string;
  descriptors: ExtensionDescriptor[];
}

/** Subset of ExtensionPackContext required by this pack. */
interface ExtensionPackContext {
  getSecret?: (id: string) => string | undefined;
  options?: Record<string, unknown>;
  /** Runtime LLM call function supplied by the AgentOS extension manager. */
  llmCall?: (prompt: string) => Promise<string>;
}

/** Kind constant matching packages/agentos/src/extensions/types.ts. */
const EXTENSION_KIND_ENDPOINT_DETECTOR = 'endpoint-detector';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a standalone {@link SemanticEndpointDetector} instance.
 *
 * Use this when composing the detector programmatically outside of the
 * AgentOS extension system.
 *
 * @param llmCall — Async function that sends a prompt string to an LLM and
 *                  resolves with the raw response text.
 * @param config  — Optional configuration overrides.
 * @returns A configured {@link SemanticEndpointDetector}.
 */
export function createSemanticEndpointDetector(
  llmCall: (prompt: string) => Promise<string>,
  config?: SemanticEndpointConfig,
): SemanticEndpointDetector {
  return new SemanticEndpointDetector(llmCall, config);
}

/**
 * AgentOS manifest factory function.
 *
 * Returns an {@link ExtensionPack} containing a single `endpoint-detector`
 * descriptor backed by {@link SemanticEndpointDetector}.
 *
 * The `llmCall` function must be provided via `context.llmCall`. When it is
 * absent a no-op stub is used (the detector will always time out and fall back
 * to silence-timeout behaviour).
 *
 * @param context — Pack context supplied by the extension manager.
 * @returns A fully configured {@link ExtensionPack}.
 */
export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const llmCall: (prompt: string) => Promise<string> =
    context.llmCall ??
    // Stub: always resolves to INCOMPLETE so the silence timeout takes over.
    (() => Promise.resolve('INCOMPLETE (no llmCall provided)'));

  const config: SemanticEndpointConfig = {
    ...(context.options as SemanticEndpointConfig | undefined),
  };

  const detector = new SemanticEndpointDetector(llmCall, config);

  return {
    id: 'endpoint-semantic',
    descriptors: [
      {
        id: 'endpoint-detector-semantic',
        kind: EXTENSION_KIND_ENDPOINT_DETECTOR,
        payload: detector,
        enableByDefault: true,
        metadata: { mode: 'semantic' },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './types.js';
export { SemanticEndpointDetector } from './SemanticEndpointDetector.js';
export { TurnCompletenessClassifier } from './TurnCompletenessClassifier.js';
export type { ClassifyResult } from './TurnCompletenessClassifier.js';
