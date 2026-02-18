/**
 * @fileoverview ITool for managing YouTube playlists.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { YouTubeService } from '../YouTubeService';

export class YouTubePlaylistTool implements ITool {
  public readonly id = 'youtubePlaylist';
  public readonly name = 'youtubePlaylist';
  public readonly displayName = 'Manage Playlist';
  public readonly description = 'Create, list, add videos to, or delete YouTube playlists.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['action'] as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'listItems', 'addVideo', 'delete'],
        description: 'Playlist action to perform',
      },
      title: { type: 'string', description: 'Playlist title (required for create)' },
      description: { type: 'string', description: 'Playlist description' },
      privacyStatus: {
        type: 'string',
        enum: ['public', 'private', 'unlisted'],
        description: 'Privacy status (default: public)',
      },
      playlistId: { type: 'string', description: 'Playlist ID (required for listItems, addVideo, delete)' },
      videoId: { type: 'string', description: 'Video ID (required for addVideo)' },
      channelId: { type: 'string', description: 'Channel ID (optional for list — defaults to own channel)' },
      maxResults: { type: 'number', description: 'Max results for list operations' },
    },
  };

  constructor(private readonly service: YouTubeService) {}

  async execute(
    args: {
      action: 'create' | 'list' | 'listItems' | 'addVideo' | 'delete';
      title?: string;
      description?: string;
      privacyStatus?: 'public' | 'private' | 'unlisted';
      playlistId?: string;
      videoId?: string;
      channelId?: string;
      maxResults?: number;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      switch (args.action) {
        case 'create': {
          if (!args.title) throw new Error('title is required for create action');
          const playlist = await this.service.createPlaylist(
            args.title,
            args.description,
            args.privacyStatus,
          );
          return { success: true, data: playlist };
        }
        case 'list': {
          const playlists = await this.service.getPlaylists(args.channelId, args.maxResults);
          return { success: true, data: { playlists, count: playlists.length } };
        }
        case 'listItems': {
          if (!args.playlistId) throw new Error('playlistId is required for listItems action');
          const items = await this.service.getPlaylistItems(args.playlistId, args.maxResults);
          return { success: true, data: { items, count: items.length } };
        }
        case 'addVideo': {
          if (!args.playlistId) throw new Error('playlistId is required for addVideo action');
          if (!args.videoId) throw new Error('videoId is required for addVideo action');
          await this.service.addToPlaylist(args.playlistId, args.videoId);
          return { success: true, data: { added: true, playlistId: args.playlistId, videoId: args.videoId } };
        }
        case 'delete': {
          if (!args.playlistId) throw new Error('playlistId is required for delete action');
          await this.service.deletePlaylist(args.playlistId);
          return { success: true, data: { deleted: true, playlistId: args.playlistId } };
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
