// @ts-nocheck
/**
 * @packageDocumentation
 * @module @framers/agentos-ext-postgres-memory
 *
 * Wilds foundation memory provider for AgentOS.
 *
 * The long-term target is a Postgres + pgvector-backed provider using
 * @framers/sql-storage-adapter. This foundation implementation already exposes
 * a real `memory-provider` descriptor and a deterministic in-process store so
 * the extension can register, execute, and be validated before the SQL layer
 * is wired in.
 */

import { randomUUID } from 'node:crypto';

import {
  EXTENSION_KIND_MEMORY_PROVIDER,
  type ExtensionContext,
  type ExtensionPack,
  type MemoryProviderDescriptor,
  type MemoryProviderPayload,
} from '@framers/agentos';

type SupportedMemoryType =
  | 'episodic'
  | 'semantic'
  | 'procedural'
  | 'prospective'
  | 'relational';

interface StoredMemoryRecord {
  id: string;
  collectionId: string;
  type: SupportedMemoryType;
  content: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

function extractMemoryType(data: unknown): SupportedMemoryType {
  if (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as { type?: unknown }).type === 'string'
  ) {
    const candidate = (data as { type: string }).type;
    if (
      candidate === 'episodic' ||
      candidate === 'semantic' ||
      candidate === 'procedural' ||
      candidate === 'prospective' ||
      candidate === 'relational'
    ) {
      return candidate;
    }
  }

  return 'episodic';
}

function extractSearchableText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (typeof data === 'object' && data !== null) {
    const candidate =
      ('content' in data && typeof (data as { content?: unknown }).content === 'string'
        ? (data as { content: string }).content
        : 'input' in data && typeof (data as { input?: unknown }).input === 'string'
          ? (data as { input: string }).input
          : null);

    if (candidate) return candidate;
  }

  return JSON.stringify(data);
}

function parseQuery(query: unknown): { text: string; type?: SupportedMemoryType; limit: number } {
  if (typeof query === 'string') {
    return { text: query.trim(), limit: 10 };
  }

  if (typeof query === 'object' && query !== null) {
    const text =
      typeof (query as { text?: unknown }).text === 'string'
        ? String((query as { text: string }).text)
        : typeof (query as { query?: unknown }).query === 'string'
          ? String((query as { query: string }).query)
          : '';

    const typeCandidate =
      typeof (query as { type?: unknown }).type === 'string'
        ? (query as { type: SupportedMemoryType }).type
        : undefined;

    const limitCandidate =
      typeof (query as { limit?: unknown }).limit === 'number'
        ? Math.max(1, Math.min(100, (query as { limit: number }).limit))
        : 10;

    return {
      text: text.trim(),
      type: typeCandidate,
      limit: limitCandidate,
    };
  }

  return { text: '', limit: 10 };
}

/**
 * Creates the postgres-memory extension pack.
 *
 * The provider accepts Postgres configuration, but currently stores records in
 * memory until the real sql-storage-adapter + pgvector layer is implemented.
 */
export function createExtensionPack(
  context: ExtensionContext<{ priority?: number }> = {},
): ExtensionPack {
  const collections = new Map<string, Map<string, StoredMemoryRecord>>();
  let connectionString =
    context.getSecret?.('POSTGRES_CONNECTION_STRING') ??
    process.env['POSTGRES_CONNECTION_STRING'] ??
    process.env['DATABASE_URL'] ??
    undefined;

  const payload: MemoryProviderPayload = {
    name: 'postgres-memory',
    description:
      'Wilds foundation memory provider with Postgres configuration hooks and an in-process fallback store.',
    supportedTypes: ['episodic', 'semantic', 'procedural', 'prospective', 'relational'],
    initialize: async (config: Record<string, unknown>) => {
      const configured =
        typeof config.connectionString === 'string'
          ? config.connectionString
          : typeof config.postgresConnectionString === 'string'
            ? config.postgresConnectionString
            : connectionString;

      connectionString = configured;
    },
    store: async (collectionId: string, data: unknown) => {
      const now = new Date().toISOString();
      const id = randomUUID();
      const record: StoredMemoryRecord = {
        id,
        collectionId,
        type: extractMemoryType(data),
        content: extractSearchableText(data),
        data,
        createdAt: now,
        updatedAt: now,
      };

      const collection = collections.get(collectionId) ?? new Map<string, StoredMemoryRecord>();
      collection.set(id, record);
      collections.set(collectionId, collection);

      return id;
    },
    query: async (collectionId: string, query: unknown) => {
      const collection = collections.get(collectionId);
      if (!collection) return [];

      const parsed = parseQuery(query);
      const normalizedText = parsed.text.toLowerCase();

      return [...collection.values()]
        .filter((record) => {
          const matchesText =
            !normalizedText || record.content.toLowerCase().includes(normalizedText);
          const matchesType = !parsed.type || record.type === parsed.type;
          return matchesText && matchesType;
        })
        .slice(0, parsed.limit)
        .map((record) => ({
          id: record.id,
          type: record.type,
          content: record.content,
          collectionId: record.collectionId,
          data: record.data,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }));
    },
    delete: async (collectionId: string, ids: string[]) => {
      const collection = collections.get(collectionId);
      if (!collection) return;

      ids.forEach((id) => collection.delete(id));
      if (collection.size === 0) {
        collections.delete(collectionId);
      }
    },
    getStats: async () => {
      const documents = [...collections.values()].reduce((sum, collection) => sum + collection.size, 0);
      return {
        collections: collections.size,
        documents,
        size: documents,
      };
    },
    shutdown: async () => {
      collections.clear();
    },
  };

  const descriptor: MemoryProviderDescriptor = {
    id: 'wilds-postgres-memory',
    kind: EXTENSION_KIND_MEMORY_PROVIDER,
    priority: typeof context.options?.priority === 'number' ? context.options.priority : 40,
    enableByDefault: true,
    requiredSecrets: [{ id: 'POSTGRES_CONNECTION_STRING', optional: true }],
    metadata: {
      implementationStatus: 'foundation-scaffold',
      storageMode: connectionString ? 'configured-postgres-fallback-store' : 'in-memory-fallback',
    },
    payload,
  };

  return {
    name: 'postgres-memory',
    version: '0.1.0',
    descriptors: [descriptor],
  };
}

export default createExtensionPack;
