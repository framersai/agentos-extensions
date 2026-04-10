// @ts-nocheck
/**
 * @fileoverview Types for the send-file-to-channel extension tool.
 * @module agentos-ext-send-file-to-channel/types
 */

/** Channel context injected by ChatTaskResponder at tool execution time. */
export interface ChannelContext {
  /** Platform identifier (telegram, whatsapp, whatsapp_cloud, whatsapp_twilio, discord, slack). */
  platform: string;
  /** Chat/conversation ID on the platform. */
  chatId: string;
  /** Sender user ID on the platform. */
  userId: string;
  /** Function to send a file to the current chat. */
  sendFileFn: (filePath: string, caption?: string) => Promise<void>;
}

/** Input schema for the send_file_to_channel tool. */
export interface SendFileInput {
  /** Absolute path to the file to send. */
  filePath: string;
  /** Optional caption to accompany the file. */
  caption?: string;
}

/** Output schema for the send_file_to_channel tool. */
export interface SendFileOutput {
  /** Whether the file was sent successfully. */
  sent: boolean;
  /** Platform the file was sent to. */
  platform: string;
  /** Name of the file sent. */
  fileName: string;
  /** File size in bytes. */
  size: number;
  /** Error message if sending failed. */
  error?: string;
}

/** Per-platform file size limits in bytes. */
export const PLATFORM_FILE_LIMITS: Record<string, number> = {
  telegram: 50 * 1024 * 1024,
  whatsapp_cloud: 100 * 1024 * 1024,
  whatsapp_twilio: 16 * 1024 * 1024,
  whatsapp: 100 * 1024 * 1024,
  discord: 25 * 1024 * 1024,
  slack: 1024 * 1024 * 1024,
};

/** Default limit for unknown platforms: 25MB. */
export const DEFAULT_FILE_LIMIT = 25 * 1024 * 1024;
