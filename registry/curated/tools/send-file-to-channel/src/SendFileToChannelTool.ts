/**
 * @fileoverview Send File to Channel — relay a local file to the user's chat.
 *
 * Checks file existence and size against platform-specific limits before sending.
 * Requires a ChannelContext to be injected by the ChatTaskResponder.
 *
 * @module agentos-ext-send-file-to-channel/SendFileToChannelTool
 */

import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { ChannelContext, SendFileInput, SendFileOutput } from './types.js';
import { PLATFORM_FILE_LIMITS, DEFAULT_FILE_LIMIT } from './types.js';

/** ITool implementation for sending files via chat channels. */
export class SendFileToChannelTool {
  readonly id = 'send_file_to_channel';
  readonly name = 'send_file_to_channel';
  readonly displayName = 'Send File to Channel';
  readonly description = 'Send a file from the local filesystem to the user via the current chat channel (Telegram, WhatsApp, etc).';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      filePath: { type: 'string', description: 'Absolute path to the file to send' },
      caption: { type: 'string', description: 'Optional message to accompany the file' },
    },
    required: ['filePath'],
  };

  private channelContext?: ChannelContext;

  /** Set the channel context for the current conversation. Called by ChatTaskResponder. */
  setChannelContext(ctx: ChannelContext): void {
    this.channelContext = ctx;
  }

  /** Execute the file send. */
  async execute(input: SendFileInput): Promise<SendFileOutput> {
    if (!this.channelContext) {
      return {
        sent: false,
        platform: 'unknown',
        fileName: '',
        size: 0,
        error: 'No active chat channel. This tool only works when invoked via a messaging channel.',
      };
    }

    if (!existsSync(input.filePath)) {
      return {
        sent: false,
        platform: this.channelContext.platform,
        fileName: basename(input.filePath),
        size: 0,
        error: `File not found: ${input.filePath}`,
      };
    }

    const fileStat = await stat(input.filePath);
    const limit = PLATFORM_FILE_LIMITS[this.channelContext.platform] ?? DEFAULT_FILE_LIMIT;
    const sizeMB = (fileStat.size / 1024 / 1024).toFixed(1);
    const limitMB = (limit / 1024 / 1024).toFixed(0);

    if (fileStat.size > limit) {
      return {
        sent: false,
        platform: this.channelContext.platform,
        fileName: basename(input.filePath),
        size: fileStat.size,
        error: `File is ${sizeMB}MB but ${this.channelContext.platform} limit is ${limitMB}MB. Would you like me to compress it first?`,
      };
    }

    await this.channelContext.sendFileFn(input.filePath, input.caption);

    return {
      sent: true,
      platform: this.channelContext.platform,
      fileName: basename(input.filePath),
      size: fileStat.size,
    };
  }
}
