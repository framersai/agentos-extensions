// @ts-nocheck
import { VerifyCitationsTool } from './VerifyCitationsTool.js';
export { VerifyCitationsTool } from './VerifyCitationsTool.js';
export type { VerifyCitationsInput, VerifyCitationsOutput } from './types.js';

export function createExtensionPack(ctx?: { config?: { embedFn?: (texts: string[]) => Promise<number[][]> } }) {
  const tool = new VerifyCitationsTool(ctx?.config);
  return {
    name: '@framers/agentos-ext-citation-verifier',
    version: '0.1.0',
    descriptors: [{ id: 'verify_citations', kind: 'tool' as const, priority: 40, payload: tool }],
  };
}
