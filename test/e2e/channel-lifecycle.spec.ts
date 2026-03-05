/**
 * E2E tests for channel extension lifecycle.
 *
 * Verifies that channel extensions can be loaded via ExtensionManager
 * and that messaging-channel descriptors end up in the correct registry.
 *
 * NOTE: We mock TelegramService.prototype methods instead of the grammy
 * module because grammy is installed inside the telegram extension's own
 * node_modules, so vi.mock('grammy') (resolved relative to *this* test
 * file) does not intercept the import from TelegramService.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Helper: dynamically import the Telegram extension pack and patch
 * TelegramService so it never touches the real grammy Bot (no network).
 */
async function importTelegramPackPatched() {
  const indexModule = await import(
    '../../registry/curated/channels/telegram/src/index'
  );
  const { TelegramService } = indexModule;

  // Prevent initialize() from creating a real grammy Bot / making network calls.
  // Instead, just flip the internal `running` flag so isRunning returns true.
  vi.spyOn(TelegramService.prototype, 'initialize').mockImplementation(async function (this: any) {
    this.running = true;
  });

  // Prevent shutdown() from calling bot.stop() on a non-existent bot.
  vi.spyOn(TelegramService.prototype, 'shutdown').mockImplementation(async function (this: any) {
    this.running = false;
    this.bot = null;
  });

  return indexModule;
}

describe('E2E: Channel Extension Lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should load a channel extension pack and register descriptors', async () => {
    const { createExtensionPack } = await importTelegramPackPatched();

    const pack = createExtensionPack({
      options: { botToken: 'test-token' },
    } as any);

    expect(pack.name).toBe('@framers/agentos-ext-channel-telegram');
    expect(pack.descriptors).toHaveLength(3);

    // Verify descriptor kinds
    const toolDescriptors = pack.descriptors.filter((d: any) => d.kind === 'tool');
    const channelDescriptors = pack.descriptors.filter((d: any) => d.kind === 'messaging-channel');

    expect(toolDescriptors).toHaveLength(2);
    expect(channelDescriptors).toHaveLength(1);
    expect(channelDescriptors[0].id).toBe('telegramChannel');
  });

  it('should activate and deactivate cleanly', async () => {
    const { createExtensionPack } = await importTelegramPackPatched();

    const pack = createExtensionPack({
      options: { botToken: 'test-token' },
      logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any);

    // Activate
    await pack.onActivate!();

    // Verify the channel adapter is accessible
    const adapter = pack.descriptors.find((d: any) => d.kind === 'messaging-channel')?.payload;
    expect(adapter).toBeDefined();
    expect(adapter.platform).toBe('telegram');
    expect(adapter.getConnectionInfo().status).toBe('connected');

    // Deactivate
    await pack.onDeactivate!();
  });

  it('should correctly set descriptor priorities', async () => {
    const { createExtensionPack } = await importTelegramPackPatched();

    const pack = createExtensionPack({
      options: { botToken: 'test-token', priority: 75 },
    } as any);

    for (const desc of pack.descriptors) {
      expect((desc as any).priority).toBe(75);
    }
  });

  it('should support multiple channel extensions simultaneously', async () => {
    const { createExtensionPack: createTelegramPack } = await importTelegramPackPatched();

    const pack1 = createTelegramPack({
      options: { botToken: 'token-1' },
    } as any);

    const pack2 = createTelegramPack({
      options: { botToken: 'token-2' },
    } as any);

    // Both packs should be independent
    expect(pack1.descriptors[2].id).toBe('telegramChannel');
    expect(pack2.descriptors[2].id).toBe('telegramChannel');

    // Descriptors should have different adapter instances
    expect(pack1.descriptors[2].payload).not.toBe(pack2.descriptors[2].payload);
  });
});
