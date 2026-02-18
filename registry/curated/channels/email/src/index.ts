/**
 * @fileoverview Email Channel Extension for AgentOS.
 *
 * Provides an IChannelAdapter + 5 tools for sending, reading, searching,
 * extracting codes from, and replying to emails via SMTP/IMAP.
 *
 * @module @framers/agentos-ext-channel-email
 */

import { EmailService } from './EmailService.js';
import type { EmailConfig } from './EmailService.js';
import { EmailChannelAdapter } from './EmailChannelAdapter.js';
import { EmailSendTool } from './tools/send.js';
import { EmailReadTool } from './tools/read.js';
import { EmailSearchTool } from './tools/search.js';
import { EmailExtractCodesTool } from './tools/extractCodes.js';
import { EmailReplyTool } from './tools/reply.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface EmailChannelOptions {
  smtpHost?: string;
  smtpUser?: string;
  smtpPassword?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  imapHost?: string;
  imapUser?: string;
  imapPassword?: string;
  imapPort?: number;
  imapSecure?: boolean;
  secrets?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Secret Resolution
// ---------------------------------------------------------------------------

function resolveConfig(opts: EmailChannelOptions, secrets: Record<string, string>): EmailConfig {
  const smtpHost = opts.smtpHost ?? secrets['email.smtp.host'] ?? process.env.EMAIL_SMTP_HOST ?? process.env.SMTP_HOST ?? '';
  const smtpUser = opts.smtpUser ?? secrets['email.smtp.user'] ?? process.env.EMAIL_SMTP_USER ?? process.env.SMTP_USER ?? '';
  const smtpPassword = opts.smtpPassword ?? secrets['email.smtp.password'] ?? process.env.EMAIL_SMTP_PASSWORD ?? process.env.SMTP_PASSWORD ?? '';

  const imapHost = opts.imapHost ?? secrets['email.imap.host'] ?? process.env.EMAIL_IMAP_HOST ?? process.env.IMAP_HOST;
  const imapUser = opts.imapUser ?? secrets['email.imap.user'] ?? process.env.EMAIL_IMAP_USER ?? process.env.IMAP_USER;
  const imapPassword = opts.imapPassword ?? secrets['email.imap.password'] ?? process.env.EMAIL_IMAP_PASSWORD ?? process.env.IMAP_PASSWORD;

  const config: EmailConfig = {
    smtp: {
      host: smtpHost,
      user: smtpUser,
      password: smtpPassword,
      port: opts.smtpPort,
      secure: opts.smtpSecure,
    },
  };

  if (imapHost && imapUser && imapPassword) {
    config.imap = {
      host: imapHost,
      user: imapUser,
      password: imapPassword,
      port: opts.imapPort,
      secure: opts.imapSecure,
    };
  }

  return config;
}

// ---------------------------------------------------------------------------
// Extension Context (matches AgentOS extension protocol)
// ---------------------------------------------------------------------------

export interface ExtensionContext {
  options?: Record<string, unknown>;
  secrets?: Record<string, string>;
}

export interface ExtensionPack {
  name: string;
  version: string;
  descriptors: Array<{ id: string; kind: string; priority?: number; payload: unknown }>;
  onActivate?: () => Promise<void>;
  onDeactivate?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createExtensionPack(context: ExtensionContext): ExtensionPack {
  const opts = (context.options ?? {}) as EmailChannelOptions;
  const secrets = opts.secrets ?? context.secrets ?? {};
  const config = resolveConfig(opts, secrets);

  const service = new EmailService(config);
  const adapter = new EmailChannelAdapter(service);

  const sendTool = new EmailSendTool(service);
  const readTool = new EmailReadTool(service);
  const searchTool = new EmailSearchTool(service);
  const extractCodesTool = new EmailExtractCodesTool(service);
  const replyTool = new EmailReplyTool(service);

  return {
    name: '@framers/agentos-ext-channel-email',
    version: '0.1.0',
    descriptors: [
      { id: 'emailSend', kind: 'tool', priority: 50, payload: sendTool },
      { id: 'emailRead', kind: 'tool', priority: 50, payload: readTool },
      { id: 'emailSearch', kind: 'tool', priority: 50, payload: searchTool },
      { id: 'emailExtractCodes', kind: 'tool', priority: 50, payload: extractCodesTool },
      { id: 'emailReply', kind: 'tool', priority: 50, payload: replyTool },
      { id: 'emailChannel', kind: 'messaging-channel', priority: 50, payload: adapter },
    ],
    onActivate: async () => {
      await adapter.initialize({ platform: 'email', credential: config.smtp.user });
    },
    onDeactivate: async () => {
      await adapter.shutdown();
    },
  };
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

export { EmailService } from './EmailService.js';
export type { EmailConfig, SendEmailOptions, EmailMessage, SearchEmailOptions } from './EmailService.js';
export { EmailChannelAdapter } from './EmailChannelAdapter.js';
export { EmailSendTool } from './tools/send.js';
export { EmailReadTool } from './tools/read.js';
export { EmailSearchTool } from './tools/search.js';
export { EmailExtractCodesTool } from './tools/extractCodes.js';
export { EmailReplyTool } from './tools/reply.js';
