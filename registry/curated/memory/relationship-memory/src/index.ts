// @ts-nocheck
/**
 * @packageDocumentation
 * @module @framers/agentos-ext-relationship-memory
 *
 * Companion relationship memory tools for Wilds.
 *
 * These tools provide a deterministic, in-process implementation of the
 * relationship-memory contract so agents can use trust ledger queries,
 * boundary recording, anchor moment recall, and intimacy scoring now.
 */

import { randomUUID } from 'node:crypto';

import {
  EXTENSION_KIND_TOOL,
  type ExtensionContext,
  type ExtensionPack,
  type ITool,
  type JSONSchemaObject,
  type ToolDescriptor,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from '@framers/agentos';

type RelationshipEventType =
  | 'trust_event'
  | 'boundary_asserted'
  | 'boundary_violated'
  | 'boundary_negotiated'
  | 'anchor_moment';

interface RelationshipEvent {
  id: string;
  accountId: string;
  companionId: string;
  eventType: RelationshipEventType;
  description: string;
  trustDelta: number;
  intimacyDelta: number;
  emotionalValence: number;
  tags: string[];
  createdAt: string;
}

const relationshipEvents = new Map<string, RelationshipEvent[]>();

function relationshipKey(accountId: string, companionId: string) {
  return `${accountId}:${companionId}`;
}

function getEventList(accountId: string, companionId: string) {
  return relationshipEvents.get(relationshipKey(accountId, companionId)) ?? [];
}

function setEventList(accountId: string, companionId: string, events: RelationshipEvent[]) {
  relationshipEvents.set(relationshipKey(accountId, companionId), events);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function summarizeRelationship(accountId: string, companionId: string) {
  const events = getEventList(accountId, companionId);
  const trustEvents = events.reduce((sum, event) => sum + event.trustDelta, 0);
  const intimacyEvents = events.reduce((sum, event) => sum + event.intimacyDelta, 0);
  const anchorMoments = events.filter((event) => event.eventType === 'anchor_moment').length;
  const violations = events.filter((event) => event.eventType === 'boundary_violated').length;

  const trustScore = clamp(50 + trustEvents, 0, 100);
  const intimacyScore = clamp(25 + intimacyEvents + anchorMoments * 6 - violations * 8, 0, 100);
  const affectionScore = clamp(40 + anchorMoments * 5 + Math.round(trustEvents * 0.35), 0, 100);

  return {
    trustScore,
    intimacyScore,
    affectionScore,
    eventCount: events.length,
    anchorMoments,
    boundaryViolations: violations,
  };
}

function createToolDescriptor(tool: ITool, priority: number): ToolDescriptor {
  return {
    id: tool.name,
    kind: EXTENSION_KIND_TOOL,
    priority,
    enableByDefault: true,
    metadata: {
      toolId: tool.id,
      origin: 'wilds-relationship-memory',
      category: tool.category ?? 'memory',
    },
    payload: tool,
    onDeactivate: async () => {
      if (typeof tool.shutdown === 'function') {
        await tool.shutdown();
      }
    },
  };
}

abstract class BaseRelationshipTool<TInput extends Record<string, unknown>, TOutput>
  implements ITool<TInput, TOutput>
{
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly description: string;
  abstract readonly inputSchema: JSONSchemaObject;
  readonly category = 'memory';
  readonly version = '0.1.0';
  readonly requiredCapabilities = ['capability:memory'];
  readonly hasSideEffects = false;

  abstract execute(
    args: TInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<TOutput>>;

  protected normalizeIds(args: Record<string, unknown>) {
    const accountId = typeof args.accountId === 'string' ? args.accountId : '';
    const companionId = typeof args.companionId === 'string' ? args.companionId : '';

    if (!accountId || !companionId) {
      throw new Error('Both accountId and companionId are required.');
    }

    return { accountId, companionId };
  }
}

class TrustLedgerQueryTool extends BaseRelationshipTool<
  { accountId: string; companionId: string; limit?: number; includeBoundaryEvents?: boolean },
  {
    accountId: string;
    companionId: string;
    summary: ReturnType<typeof summarizeRelationship>;
    events: RelationshipEvent[];
  }
> {
  readonly id = 'wilds-relationship-trust-ledger-query';
  readonly name = 'trust_ledger_query';
  readonly displayName = 'Trust Ledger Query';
  readonly description =
    'Query trust and relationship events between an account and a companion, including derived relationship scores.';
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      accountId: { type: 'string', description: 'Account UUID for the relationship owner.' },
      companionId: { type: 'string', description: 'Companion UUID for the relationship target.' },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum events to return.' },
      includeBoundaryEvents: {
        type: 'boolean',
        description: 'When false, hides boundary_* events and returns trust/anchor events only.',
      },
    },
    required: ['accountId', 'companionId'],
  };

  async execute(
    args: { accountId: string; companionId: string; limit?: number; includeBoundaryEvents?: boolean },
    _context: ToolExecutionContext,
  ): Promise<
    ToolExecutionResult<{
      accountId: string;
      companionId: string;
      summary: ReturnType<typeof summarizeRelationship>;
      events: RelationshipEvent[];
    }>
  > {
    const { accountId, companionId } = this.normalizeIds(args);
    const summary = summarizeRelationship(accountId, companionId);
    const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(100, args.limit)) : 20;
    const includeBoundaryEvents = args.includeBoundaryEvents ?? true;
    const events = getEventList(accountId, companionId)
      .filter((event) => includeBoundaryEvents || !event.eventType.startsWith('boundary_'))
      .slice(-limit)
      .reverse();

    return {
      success: true,
      output: {
        accountId,
        companionId,
        summary,
        events,
      },
    };
  }
}

class RecordBoundaryTool extends BaseRelationshipTool<
  {
    accountId: string;
    companionId: string;
    eventType: RelationshipEventType;
    description: string;
    trustDelta?: number;
    intimacyDelta?: number;
    emotionalValence?: number;
    tags?: string[];
  },
  {
    event: RelationshipEvent;
    summary: ReturnType<typeof summarizeRelationship>;
  }
> {
  readonly id = 'wilds-relationship-record-boundary';
  readonly name = 'record_boundary';
  readonly displayName = 'Record Boundary Event';
  readonly description =
    'Record a trust, boundary, or anchor-moment event between an account and a companion.';
  readonly hasSideEffects = true;
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      accountId: { type: 'string', description: 'Account UUID for the relationship owner.' },
      companionId: { type: 'string', description: 'Companion UUID for the relationship target.' },
      eventType: {
        type: 'string',
        enum: [
          'trust_event',
          'boundary_asserted',
          'boundary_violated',
          'boundary_negotiated',
          'anchor_moment',
        ],
        description: 'Type of relationship event being recorded.',
      },
      description: { type: 'string', description: 'Human-readable description of the event.' },
      trustDelta: { type: 'number', description: 'Trust score adjustment for this event.' },
      intimacyDelta: { type: 'number', description: 'Intimacy score adjustment for this event.' },
      emotionalValence: {
        type: 'number',
        minimum: -1,
        maximum: 1,
        description: 'Emotional valence of the event from negative to positive.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for later filtering and anchor recall.',
      },
    },
    required: ['accountId', 'companionId', 'eventType', 'description'],
  };

  async execute(
    args: {
      accountId: string;
      companionId: string;
      eventType: RelationshipEventType;
      description: string;
      trustDelta?: number;
      intimacyDelta?: number;
      emotionalValence?: number;
      tags?: string[];
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ event: RelationshipEvent; summary: ReturnType<typeof summarizeRelationship> }>> {
    const { accountId, companionId } = this.normalizeIds(args);
    const event: RelationshipEvent = {
      id: randomUUID(),
      accountId,
      companionId,
      eventType: args.eventType,
      description: args.description,
      trustDelta: typeof args.trustDelta === 'number' ? args.trustDelta : 0,
      intimacyDelta: typeof args.intimacyDelta === 'number' ? args.intimacyDelta : 0,
      emotionalValence:
        typeof args.emotionalValence === 'number' ? clamp(args.emotionalValence, -1, 1) : 0,
      tags: Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      createdAt: new Date().toISOString(),
    };

    const events = getEventList(accountId, companionId);
    setEventList(accountId, companionId, [...events, event]);

    return {
      success: true,
      output: {
        event,
        summary: summarizeRelationship(accountId, companionId),
      },
    };
  }
}

class AnchorMomentRecallTool extends BaseRelationshipTool<
  { accountId: string; companionId: string; limit?: number; tag?: string; minValence?: number },
  {
    accountId: string;
    companionId: string;
    anchorMoments: RelationshipEvent[];
  }
> {
  readonly id = 'wilds-relationship-anchor-moment-recall';
  readonly name = 'anchor_moment_recall';
  readonly displayName = 'Anchor Moment Recall';
  readonly description =
    'Recall anchor moments shared between an account and a companion, optionally filtered by tag or emotion.';
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      accountId: { type: 'string', description: 'Account UUID for the relationship owner.' },
      companionId: { type: 'string', description: 'Companion UUID for the relationship target.' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum anchor moments to return.' },
      tag: { type: 'string', description: 'Optional tag filter.' },
      minValence: {
        type: 'number',
        minimum: -1,
        maximum: 1,
        description: 'Optional minimum emotional valence.',
      },
    },
    required: ['accountId', 'companionId'],
  };

  async execute(
    args: { accountId: string; companionId: string; limit?: number; tag?: string; minValence?: number },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ accountId: string; companionId: string; anchorMoments: RelationshipEvent[] }>> {
    const { accountId, companionId } = this.normalizeIds(args);
    const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(50, args.limit)) : 10;

    const anchorMoments = getEventList(accountId, companionId)
      .filter((event) => event.eventType === 'anchor_moment')
      .filter((event) => (args.tag ? event.tags.includes(args.tag) : true))
      .filter((event) =>
        typeof args.minValence === 'number' ? event.emotionalValence >= args.minValence : true,
      )
      .slice(-limit)
      .reverse();

    return {
      success: true,
      output: {
        accountId,
        companionId,
        anchorMoments,
      },
    };
  }
}

class IntimacyScoreTool extends BaseRelationshipTool<
  { accountId: string; companionId: string },
  ReturnType<typeof summarizeRelationship>
> {
  readonly id = 'wilds-relationship-intimacy-score';
  readonly name = 'intimacy_score';
  readonly displayName = 'Intimacy Score';
  readonly description =
    'Compute the current relationship summary between an account and a companion using trust, intimacy, anchor, and violation signals.';
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      accountId: { type: 'string', description: 'Account UUID for the relationship owner.' },
      companionId: { type: 'string', description: 'Companion UUID for the relationship target.' },
    },
    required: ['accountId', 'companionId'],
  };

  async execute(
    args: { accountId: string; companionId: string },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<ReturnType<typeof summarizeRelationship>>> {
    const { accountId, companionId } = this.normalizeIds(args);

    return {
      success: true,
      output: summarizeRelationship(accountId, companionId),
    };
  }
}

/**
 * Creates the relationship-memory extension pack.
 */
export function createExtensionPack(
  context: ExtensionContext<{ priority?: number }> = {},
): ExtensionPack {
  const priority = typeof context.options?.priority === 'number' ? context.options.priority : 50;

  const tools: ITool[] = [
    new TrustLedgerQueryTool(),
    new RecordBoundaryTool(),
    new AnchorMomentRecallTool(),
    new IntimacyScoreTool(),
  ];

  return {
    name: 'relationship-memory',
    version: '0.1.0',
    descriptors: tools.map((tool) => createToolDescriptor(tool, priority)),
  };
}

export default createExtensionPack;
