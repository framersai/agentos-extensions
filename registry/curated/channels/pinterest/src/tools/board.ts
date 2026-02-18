/**
 * @fileoverview ITool for creating and managing Pinterest boards.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { PinterestService } from '../PinterestService';

export class PinterestBoardTool implements ITool {
  public readonly id = 'pinterestBoard';
  public readonly name = 'pinterestBoard';
  public readonly displayName = 'Manage Board';
  public readonly description = 'Create, list, or delete Pinterest boards.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['action'] as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'listPins', 'delete'],
        description: 'Board action to perform',
      },
      name: { type: 'string', description: 'Board name (required for create)' },
      description: { type: 'string', description: 'Board description' },
      privacy: {
        type: 'string',
        enum: ['PUBLIC', 'PROTECTED', 'SECRET'],
        description: 'Board privacy setting',
      },
      boardId: { type: 'string', description: 'Board ID (required for listPins, delete)' },
      maxResults: { type: 'number', description: 'Max results to return' },
    },
  };

  constructor(private readonly service: PinterestService) {}

  async execute(
    args: {
      action: 'create' | 'list' | 'listPins' | 'delete';
      name?: string;
      description?: string;
      privacy?: 'PUBLIC' | 'PROTECTED' | 'SECRET';
      boardId?: string;
      maxResults?: number;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      switch (args.action) {
        case 'create': {
          if (!args.name) throw new Error('name is required for create action');
          const board = await this.service.createBoard({
            name: args.name,
            description: args.description,
            privacy: args.privacy,
          });
          return { success: true, data: board };
        }
        case 'list': {
          const boards = await this.service.getBoards();
          return { success: true, data: { boards, count: boards.length } };
        }
        case 'listPins': {
          if (!args.boardId) throw new Error('boardId is required for listPins action');
          const pins = await this.service.getBoardPins(args.boardId, args.maxResults);
          return { success: true, data: { pins, count: pins.length } };
        }
        case 'delete': {
          if (!args.boardId) throw new Error('boardId is required for delete action');
          await this.service.deleteBoard(args.boardId);
          return { success: true, data: { deleted: true, boardId: args.boardId } };
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
