/**
 * Agent Broadcast Tool — fan out a task to multiple agents in parallel.
 *
 * Sends the same message to N remote agents simultaneously and collects
 * all responses. Useful for consensus-based decision making or parallel
 * task decomposition.
 */

import type { ChatResponse } from './types.js';
import { safeFetch, authHeaders, normalizeUrl } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentTarget {
  /** URL of the remote agent. */
  url: string;
  /** Optional chat secret. */
  secret?: string;
  /** Human-readable label (e.g. "research-agent", "code-agent"). */
  label?: string;
  /** Target a specific persona on this agent. */
  personaId?: string;
}

export interface AgentBroadcastInput {
  /** The message/task to send to all agents. */
  message: string;
  /** List of agent endpoints to broadcast to. */
  agents: AgentTarget[];
  /** Session ID for conversation continuity. */
  sessionId?: string;
  /** Timeout per agent in milliseconds (default: 120000). */
  timeoutMs?: number;
}

export interface AgentReplyEntry {
  url: string;
  label?: string;
  ok: boolean;
  reply?: string;
  personaId?: string;
  error?: string;
  durationMs: number;
}

export interface AgentBroadcastOutput {
  /** Total agents targeted. */
  total: number;
  /** How many responded successfully. */
  succeeded: number;
  /** How many failed. */
  failed: number;
  /** Individual responses. */
  responses: AgentReplyEntry[];
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class AgentBroadcastTool {
  public readonly id = 'agent-broadcast-v1';
  public readonly name = 'agent_broadcast';
  public readonly displayName = 'Broadcast to Agents';
  public readonly description =
    'Send the same task to multiple remote Wunderland agents in parallel and collect all responses. '
    + 'Useful for getting multiple perspectives, consensus-based decisions, or parallelizing work across a swarm.';
  public readonly category = 'orchestration';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['message', 'agents'] as const,
    properties: {
      message: {
        type: 'string' as const,
        description: 'The task or question to broadcast to all agents.',
      },
      agents: {
        type: 'array' as const,
        description: 'List of agent endpoints to broadcast to.',
        items: {
          type: 'object' as const,
          required: ['url'] as const,
          properties: {
            url: { type: 'string' as const, description: 'Agent URL.' },
            secret: { type: 'string' as const, description: 'Chat secret (if required).' },
            label: { type: 'string' as const, description: 'Human-readable label for this agent.' },
            personaId: { type: 'string' as const, description: 'Target persona on this agent.' },
          },
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 10,
      },
      sessionId: {
        type: 'string' as const,
        description: 'Shared session ID for all agents.',
      },
      timeoutMs: {
        type: 'integer' as const,
        description: 'Per-agent timeout in milliseconds.',
        default: 120_000,
        minimum: 5_000,
        maximum: 600_000,
      },
    },
    additionalProperties: false,
  };

  async execute(
    input: AgentBroadcastInput,
    _context: unknown,
  ): Promise<{ success: boolean; output?: AgentBroadcastOutput; error?: string }> {
    const timeout = input.timeoutMs ?? 120_000;

    const promises = input.agents.map(async (agent): Promise<AgentReplyEntry> => {
      const base = normalizeUrl(agent.url);
      const start = Date.now();

      const body: Record<string, unknown> = { message: input.message };
      if (input.sessionId) body.sessionId = input.sessionId;
      if (agent.personaId) body.personaId = agent.personaId;

      const result = await safeFetch<ChatResponse>(`${base}/chat`, {
        method: 'POST',
        headers: authHeaders(agent.secret),
        body: JSON.stringify(body),
        timeoutMs: timeout,
      });

      const durationMs = Date.now() - start;

      if (!result.ok) {
        return {
          url: base,
          label: agent.label,
          ok: false,
          error: result.error || `HTTP ${result.status}`,
          durationMs,
        };
      }

      return {
        url: base,
        label: agent.label,
        ok: true,
        reply: result.data?.reply ?? '',
        personaId: result.data?.personaId,
        durationMs,
      };
    });

    const responses = await Promise.all(promises);
    const succeeded = responses.filter((r) => r.ok).length;

    return {
      success: true,
      output: {
        total: responses.length,
        succeeded,
        failed: responses.length - succeeded,
        responses,
      },
    };
  }
}
