/**
 * Agent Ping Tool — check if a remote Wunderland agent is reachable.
 *
 * Returns the agent's health metadata (name, seedId, tools count, personas,
 * uptime, etc.) so the calling agent can decide whether to delegate.
 */

import type {
  AgentHealthResponse,
  PersonaListResponse,
} from './types.js';
import { safeFetch, normalizeUrl } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentPingInput {
  /** URL of the remote agent (e.g. "http://localhost:3778"). */
  url: string;
  /** If true, also fetch the persona list from /api/agentos/personas. */
  includePersonas?: boolean;
}

export interface AgentPingOutput {
  reachable: boolean;
  url: string;
  agent?: {
    seedId: string;
    name: string;
    uptime: number;
    version?: string;
    tools?: number;
    channels?: number;
    personasAvailable?: number;
    memory?: { rss: number; heap: number };
  };
  personas?: Array<{ id: string; name: string; description?: string }>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class AgentPingTool {
  public readonly id = 'agent-ping-v1';
  public readonly name = 'agent_ping';
  public readonly displayName = 'Ping Remote Agent';
  public readonly description =
    'Check if a remote Wunderland agent is reachable and retrieve its metadata '
    + '(name, seed ID, loaded tools, channels, personas, uptime). '
    + 'Use this before delegating tasks to verify the target agent is alive.';
  public readonly category = 'orchestration';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['url'] as const,
    properties: {
      url: {
        type: 'string' as const,
        description: 'URL of the remote Wunderland agent (e.g. "http://192.168.1.50:3777").',
      },
      includePersonas: {
        type: 'boolean' as const,
        description: 'Also fetch the list of available personas from the remote agent.',
        default: false,
      },
    },
    additionalProperties: false,
  };

  async execute(
    input: AgentPingInput,
    _context: unknown,
  ): Promise<{ success: boolean; output?: AgentPingOutput; error?: string }> {
    const base = normalizeUrl(input.url);

    // 1. Health check
    const health = await safeFetch<AgentHealthResponse>(`${base}/health`, {
      timeoutMs: 8_000,
    });

    if (!health.ok || !health.data?.ok) {
      return {
        success: true,
        output: {
          reachable: false,
          url: base,
          error: health.error || 'Agent health check failed',
        },
      };
    }

    const h = health.data;
    const result: AgentPingOutput = {
      reachable: true,
      url: base,
      agent: {
        seedId: h.seedId,
        name: h.name,
        uptime: h.uptime,
        version: h.version,
        tools: h.tools,
        channels: h.channels,
        personasAvailable: h.personasAvailable,
        memory: h.memory,
      },
    };

    // 2. Optionally fetch personas
    if (input.includePersonas) {
      const personas = await safeFetch<PersonaListResponse>(
        `${base}/api/agentos/personas`,
        { timeoutMs: 5_000 },
      );
      if (personas.ok && personas.data?.personas) {
        result.personas = personas.data.personas.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
        }));
      }
    }

    return { success: true, output: result };
  }
}
