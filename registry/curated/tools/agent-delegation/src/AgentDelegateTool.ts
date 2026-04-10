// @ts-nocheck
/**
 * Agent Delegate Tool — send a task to a remote Wunderland agent.
 *
 * Posts a message to the remote agent's /chat endpoint and returns the reply.
 * Supports session continuity and persona targeting.
 */

import type { ChatResponse } from './types.js';
import { safeFetch, authHeaders, normalizeUrl } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentDelegateInput {
  /** URL of the remote agent (e.g. "http://192.168.1.50:3777"). */
  url: string;
  /** The task or message to send to the remote agent. */
  message: string;
  /** Optional chat secret for authentication. */
  secret?: string;
  /** Session ID for conversation continuity across multiple delegations. */
  sessionId?: string;
  /** Target a specific persona on the remote agent. */
  personaId?: string;
  /** Reset the remote session before sending the message. */
  reset?: boolean;
  /** Timeout in milliseconds (default: 120000 = 2 min). Agent tasks may take a while. */
  timeoutMs?: number;
}

export interface AgentDelegateOutput {
  /** Whether the remote agent responded successfully. */
  ok: boolean;
  /** The remote agent's text reply. */
  reply?: string;
  /** Which persona processed the request. */
  personaId?: string;
  /** The URL that was called. */
  url: string;
  /** Error message if the delegation failed. */
  error?: string;
  /** HTTP status code (0 = network/timeout error). */
  httpStatus?: number;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class AgentDelegateTool {
  public readonly id = 'agent-delegate-v1';
  public readonly name = 'agent_delegate';
  public readonly displayName = 'Delegate Task to Agent';
  public readonly description =
    'Send a task or question to a remote Wunderland agent and receive its response. '
    + 'The remote agent processes the message using its own tools and LLM, then returns a text reply. '
    + 'Use sessionId to maintain conversation continuity across multiple delegations.';
  public readonly category = 'orchestration';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['url', 'message'] as const,
    properties: {
      url: {
        type: 'string' as const,
        description: 'URL of the remote Wunderland agent.',
      },
      message: {
        type: 'string' as const,
        description: 'The task, question, or instruction to send to the remote agent.',
      },
      secret: {
        type: 'string' as const,
        description: 'Chat secret for the remote agent (if required).',
      },
      sessionId: {
        type: 'string' as const,
        description:
          'Session identifier for conversation continuity. '
          + 'Use the same sessionId across multiple calls to maintain context.',
      },
      personaId: {
        type: 'string' as const,
        description: 'Target a specific persona on the remote agent.',
      },
      reset: {
        type: 'boolean' as const,
        description: 'Clear the remote session history before sending this message.',
        default: false,
      },
      timeoutMs: {
        type: 'integer' as const,
        description: 'Timeout in milliseconds. Agent tasks with tool-calling may take a while.',
        default: 120_000,
        minimum: 5_000,
        maximum: 600_000,
      },
    },
    additionalProperties: false,
  };

  async execute(
    input: AgentDelegateInput,
    _context: unknown,
  ): Promise<{ success: boolean; output?: AgentDelegateOutput; error?: string }> {
    const base = normalizeUrl(input.url);
    const timeout = input.timeoutMs ?? 120_000;

    const body: Record<string, unknown> = { message: input.message };
    if (input.sessionId) body.sessionId = input.sessionId;
    if (input.personaId) body.personaId = input.personaId;
    if (input.reset) body.reset = true;

    const result = await safeFetch<ChatResponse>(`${base}/chat`, {
      method: 'POST',
      headers: authHeaders(input.secret),
      body: JSON.stringify(body),
      timeoutMs: timeout,
    });

    if (!result.ok) {
      return {
        success: true, // tool itself succeeded, the delegation failed
        output: {
          ok: false,
          url: base,
          error: result.error || `Delegation failed (HTTP ${result.status})`,
          httpStatus: result.status,
        },
      };
    }

    return {
      success: true,
      output: {
        ok: true,
        url: base,
        reply: result.data?.reply ?? '',
        personaId: result.data?.personaId,
      },
    };
  }
}
