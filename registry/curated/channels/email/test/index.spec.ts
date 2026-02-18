/**
 * Unit tests for the Email channel extension factory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock nodemailer before importing the factory
vi.mock('nodemailer', () => ({
  createTransport: vi.fn().mockReturnValue({
    sendMail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    verify: vi.fn().mockResolvedValue(true),
    close: vi.fn(),
  }),
}));

// Mock imapflow before importing the factory
vi.mock('imapflow', () => ({
  ImapFlow: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
    mailbox: { exists: 0 },
    search: vi.fn().mockResolvedValue([]),
    fetch: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true }) }) }),
  })),
}));

import { createExtensionPack } from '../src/index';

describe('createExtensionPack', () => {
  it('should create a pack with the correct name and version', () => {
    const pack = createExtensionPack({
      options: { smtpHost: 'smtp.test.com', smtpUser: 'user', smtpPassword: 'pass' },
    });
    expect(pack.name).toBe('@framers/agentos-ext-channel-email');
    expect(pack.version).toBe('0.1.0');
  });

  it('should include 5 tool descriptors and 1 messaging-channel descriptor', () => {
    const pack = createExtensionPack({
      options: { smtpHost: 'smtp.test.com', smtpUser: 'user', smtpPassword: 'pass' },
    });

    expect(pack.descriptors).toHaveLength(6);

    const tools = pack.descriptors.filter((d) => d.kind === 'tool');
    const channels = pack.descriptors.filter((d) => d.kind === 'messaging-channel');

    expect(tools).toHaveLength(5);
    expect(channels).toHaveLength(1);
  });

  it('should expose the correct tool IDs', () => {
    const pack = createExtensionPack({
      options: { smtpHost: 'smtp.test.com', smtpUser: 'user', smtpPassword: 'pass' },
    });

    const ids = pack.descriptors.map((d) => d.id);
    expect(ids).toContain('emailSend');
    expect(ids).toContain('emailRead');
    expect(ids).toContain('emailSearch');
    expect(ids).toContain('emailExtractCodes');
    expect(ids).toContain('emailReply');
  });

  it('should expose the emailChannel descriptor', () => {
    const pack = createExtensionPack({
      options: { smtpHost: 'smtp.test.com', smtpUser: 'user', smtpPassword: 'pass' },
    });

    const channelDesc = pack.descriptors.find((d) => d.id === 'emailChannel');
    expect(channelDesc).toBeDefined();
    expect(channelDesc!.kind).toBe('messaging-channel');
    expect(channelDesc!.priority).toBe(50);
  });

  it('should set priority 50 for all descriptors', () => {
    const pack = createExtensionPack({
      options: { smtpHost: 'smtp.test.com', smtpUser: 'user', smtpPassword: 'pass' },
    });
    pack.descriptors.forEach((d) => {
      expect(d.priority).toBe(50);
    });
  });

  it('should resolve config from secrets map', () => {
    const pack = createExtensionPack({
      options: {
        secrets: {
          'email.smtp.host': 'smtp.secret.com',
          'email.smtp.user': 'secret-user',
          'email.smtp.password': 'secret-pass',
        },
      },
    });
    // Pack should create successfully with secrets-resolved config
    expect(pack.descriptors).toHaveLength(6);
  });

  it('should resolve config from context-level secrets', () => {
    const pack = createExtensionPack({
      secrets: {
        'email.smtp.host': 'smtp.ctx.com',
        'email.smtp.user': 'ctx-user',
        'email.smtp.password': 'ctx-pass',
      },
    });
    expect(pack.descriptors).toHaveLength(6);
  });

  it('should have onActivate and onDeactivate lifecycle hooks', () => {
    const pack = createExtensionPack({
      options: { smtpHost: 'smtp.test.com', smtpUser: 'user', smtpPassword: 'pass' },
    });
    expect(typeof pack.onActivate).toBe('function');
    expect(typeof pack.onDeactivate).toBe('function');
  });

  it('should activate and deactivate without errors', async () => {
    const pack = createExtensionPack({
      options: { smtpHost: 'smtp.test.com', smtpUser: 'user', smtpPassword: 'pass' },
    });
    await pack.onActivate!();
    await pack.onDeactivate!();
  });

  it('should attach tool instances with execute methods as payload', () => {
    const pack = createExtensionPack({
      options: { smtpHost: 'smtp.test.com', smtpUser: 'user', smtpPassword: 'pass' },
    });
    const tools = pack.descriptors.filter((d) => d.kind === 'tool');
    tools.forEach((d) => {
      expect(d.payload).toBeDefined();
      expect(typeof (d.payload as any).execute).toBe('function');
    });
  });

  it('should attach adapter instance as channel payload', () => {
    const pack = createExtensionPack({
      options: { smtpHost: 'smtp.test.com', smtpUser: 'user', smtpPassword: 'pass' },
    });
    const channelDesc = pack.descriptors.find((d) => d.id === 'emailChannel');
    const adapter = channelDesc!.payload as any;
    expect(adapter.platform).toBe('email');
    expect(typeof adapter.sendMessage).toBe('function');
  });
});
