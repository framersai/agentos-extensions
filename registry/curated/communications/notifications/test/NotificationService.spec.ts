/**
 * Unit tests for NotificationService.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NotificationService,
  type NotificationChannel,
  type SendResult,
} from '../src/NotificationService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockChannel(overrides: Partial<NotificationChannel> = {}): NotificationChannel {
  return {
    id: overrides.id ?? 'test-channel',
    name: overrides.name ?? 'Test Channel',
    priority: overrides.priority ?? 10,
    sendFn: overrides.sendFn ?? vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new NotificationService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Lifecycle ──

  describe('lifecycle', () => {
    it('should not be running before initialize', () => {
      expect(service.isRunning).toBe(false);
    });

    it('should be running after initialize', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should stop running after shutdown', async () => {
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should cancel all scheduled notifications on shutdown', async () => {
      await service.initialize();
      const ch = createMockChannel();
      service.registerChannel(ch);

      service.schedule({ message: 'a', sendAt: new Date(Date.now() + 60_000).toISOString() });
      service.schedule({ message: 'b', sendAt: new Date(Date.now() + 120_000).toISOString() });
      expect(service.getScheduled()).toHaveLength(2);

      await service.shutdown();
      expect(service.getScheduled()).toHaveLength(0);
    });
  });

  // ── Channel Registry ──

  describe('channel registry', () => {
    it('should register and list a channel', () => {
      const ch = createMockChannel({ id: 'email', name: 'Email', priority: 20 });
      service.registerChannel(ch);
      const list = service.listChannels();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('email');
    });

    it('should sort channels by priority descending', () => {
      service.registerChannel(createMockChannel({ id: 'low', priority: 5 }));
      service.registerChannel(createMockChannel({ id: 'high', priority: 99 }));
      service.registerChannel(createMockChannel({ id: 'mid', priority: 50 }));

      const ids = service.listChannels().map((c) => c.id);
      expect(ids).toEqual(['high', 'mid', 'low']);
    });

    it('should unregister a channel', () => {
      service.registerChannel(createMockChannel({ id: 'x' }));
      expect(service.unregisterChannel('x')).toBe(true);
      expect(service.listChannels()).toHaveLength(0);
    });

    it('should return false when unregistering unknown channel', () => {
      expect(service.unregisterChannel('nonexistent')).toBe(false);
    });
  });

  // ── Send ──

  describe('send', () => {
    it('should route to the specified channel', async () => {
      const sendFn = vi.fn().mockResolvedValue(undefined);
      service.registerChannel(createMockChannel({ id: 'slack', name: 'Slack', sendFn }));
      service.registerChannel(createMockChannel({ id: 'email', name: 'Email' }));

      const result = await service.send({ channel: 'slack', message: 'hello' });
      expect(result.channelId).toBe('slack');
      expect(result.channelName).toBe('Slack');
      expect(result.delivered).toBe(true);
      expect(sendFn).toHaveBeenCalledWith('hello', { subject: undefined, metadata: undefined });
    });

    it('should route to the highest-priority channel when none specified', async () => {
      const highSendFn = vi.fn().mockResolvedValue(undefined);
      service.registerChannel(createMockChannel({ id: 'low', priority: 5 }));
      service.registerChannel(createMockChannel({ id: 'high', priority: 100, name: 'High', sendFn: highSendFn }));

      const result = await service.send({ message: 'important' });
      expect(result.channelId).toBe('high');
      expect(highSendFn).toHaveBeenCalledWith('important', { subject: undefined, metadata: undefined });
    });

    it('should forward subject and metadata to sendFn', async () => {
      const sendFn = vi.fn().mockResolvedValue(undefined);
      service.registerChannel(createMockChannel({ id: 'ch', sendFn }));

      await service.send({
        channel: 'ch',
        message: 'body',
        subject: 'subj',
        metadata: { key: 'val' },
      });

      expect(sendFn).toHaveBeenCalledWith('body', { subject: 'subj', metadata: { key: 'val' } });
    });

    it('should throw when specified channel is not found', async () => {
      await expect(service.send({ channel: 'missing', message: 'hi' }))
        .rejects.toThrow('Notification channel "missing" not found');
    });

    it('should throw when no channels registered and none specified', async () => {
      await expect(service.send({ message: 'hi' }))
        .rejects.toThrow('No notification channels registered');
    });

    it('should return delivered=false with error when sendFn throws', async () => {
      const sendFn = vi.fn().mockRejectedValue(new Error('network failure'));
      service.registerChannel(createMockChannel({ id: 'broken', name: 'Broken', sendFn }));

      const result = await service.send({ channel: 'broken', message: 'hi' });
      expect(result.delivered).toBe(false);
      expect(result.error).toBe('network failure');
      expect(result.channelId).toBe('broken');
    });
  });

  // ── Broadcast ──

  describe('broadcast', () => {
    it('should broadcast to all registered channels', async () => {
      const fn1 = vi.fn().mockResolvedValue(undefined);
      const fn2 = vi.fn().mockResolvedValue(undefined);
      service.registerChannel(createMockChannel({ id: 'a', name: 'A', sendFn: fn1 }));
      service.registerChannel(createMockChannel({ id: 'b', name: 'B', sendFn: fn2 }));

      const results = await service.broadcast({ message: 'hey all' });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.delivered)).toBe(true);
      expect(fn1).toHaveBeenCalledWith('hey all', { subject: undefined, metadata: undefined });
      expect(fn2).toHaveBeenCalledWith('hey all', { subject: undefined, metadata: undefined });
    });

    it('should broadcast to a specified subset of channels', async () => {
      const fn1 = vi.fn().mockResolvedValue(undefined);
      const fn2 = vi.fn().mockResolvedValue(undefined);
      const fn3 = vi.fn().mockResolvedValue(undefined);
      service.registerChannel(createMockChannel({ id: 'a', name: 'A', sendFn: fn1 }));
      service.registerChannel(createMockChannel({ id: 'b', name: 'B', sendFn: fn2 }));
      service.registerChannel(createMockChannel({ id: 'c', name: 'C', sendFn: fn3 }));

      const results = await service.broadcast({ message: 'partial', channels: ['a', 'c'] });
      expect(results).toHaveLength(2);
      expect(fn1).toHaveBeenCalled();
      expect(fn2).not.toHaveBeenCalled();
      expect(fn3).toHaveBeenCalled();
    });

    it('should skip non-existent channel IDs in subset', async () => {
      service.registerChannel(createMockChannel({ id: 'a', name: 'A' }));

      const results = await service.broadcast({ message: 'test', channels: ['a', 'nonexistent'] });
      expect(results).toHaveLength(1);
      expect(results[0].channelId).toBe('a');
    });

    it('should throw when no channels are available', async () => {
      await expect(service.broadcast({ message: 'hello' }))
        .rejects.toThrow('No notification channels available for broadcast');
    });

    it('should collect errors from failing channels', async () => {
      const fn1 = vi.fn().mockResolvedValue(undefined);
      const fn2 = vi.fn().mockRejectedValue(new Error('channel down'));
      service.registerChannel(createMockChannel({ id: 'ok', name: 'OK', sendFn: fn1 }));
      service.registerChannel(createMockChannel({ id: 'fail', name: 'Fail', sendFn: fn2 }));

      const results = await service.broadcast({ message: 'multi' });
      expect(results).toHaveLength(2);

      const okResult = results.find((r) => r.channelId === 'ok')!;
      const failResult = results.find((r) => r.channelId === 'fail')!;
      expect(okResult.delivered).toBe(true);
      expect(failResult.delivered).toBe(false);
      expect(failResult.error).toBe('channel down');
    });

    it('should forward subject and metadata to every channel', async () => {
      const fn1 = vi.fn().mockResolvedValue(undefined);
      const fn2 = vi.fn().mockResolvedValue(undefined);
      service.registerChannel(createMockChannel({ id: 'a', sendFn: fn1 }));
      service.registerChannel(createMockChannel({ id: 'b', sendFn: fn2 }));

      await service.broadcast({
        message: 'msg',
        subject: 'Important',
        metadata: { urgency: 'high' },
      });

      expect(fn1).toHaveBeenCalledWith('msg', { subject: 'Important', metadata: { urgency: 'high' } });
      expect(fn2).toHaveBeenCalledWith('msg', { subject: 'Important', metadata: { urgency: 'high' } });
    });
  });

  // ── Schedule ──

  describe('schedule', () => {
    it('should create a scheduled notification with a unique ID', () => {
      service.registerChannel(createMockChannel({ id: 'ch' }));

      const notif = service.schedule({
        message: 'later',
        sendAt: new Date(Date.now() + 60_000).toISOString(),
      });

      expect(notif.id).toMatch(/^notif_/);
      expect(notif.message).toBe('later');
      expect(notif.sendAt).toBeDefined();
    });

    it('should store the scheduled notification in getScheduled', () => {
      service.registerChannel(createMockChannel({ id: 'ch' }));

      service.schedule({ message: 'a', sendAt: new Date(Date.now() + 60_000).toISOString() });
      service.schedule({ message: 'b', sendAt: new Date(Date.now() + 120_000).toISOString() });

      expect(service.getScheduled()).toHaveLength(2);
    });

    it('should fire the notification after the delay', async () => {
      const sendFn = vi.fn().mockResolvedValue(undefined);
      service.registerChannel(createMockChannel({ id: 'ch', sendFn }));

      service.schedule({
        channel: 'ch',
        message: 'timed',
        subject: 'alert',
        sendAt: new Date(Date.now() + 5_000).toISOString(),
      });

      expect(sendFn).not.toHaveBeenCalled();

      // Advance past the scheduled time
      await vi.advanceTimersByTimeAsync(5_000);

      expect(sendFn).toHaveBeenCalledWith('timed', { subject: 'alert', metadata: undefined });
    });

    it('should remove the notification from scheduled after firing', async () => {
      service.registerChannel(createMockChannel({ id: 'ch' }));

      service.schedule({
        message: 'temp',
        sendAt: new Date(Date.now() + 1_000).toISOString(),
      });
      expect(service.getScheduled()).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1_000);

      expect(service.getScheduled()).toHaveLength(0);
    });

    it('should fire immediately when sendAt is in the past', async () => {
      const sendFn = vi.fn().mockResolvedValue(undefined);
      service.registerChannel(createMockChannel({ id: 'ch', sendFn }));

      service.schedule({
        channel: 'ch',
        message: 'overdue',
        sendAt: new Date(Date.now() - 10_000).toISOString(),
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(sendFn).toHaveBeenCalledWith('overdue', expect.any(Object));
    });

    it('should cancel a scheduled notification', () => {
      service.registerChannel(createMockChannel({ id: 'ch' }));

      const notif = service.schedule({
        message: 'cancel me',
        sendAt: new Date(Date.now() + 60_000).toISOString(),
      });

      expect(service.cancelScheduled(notif.id)).toBe(true);
      expect(service.getScheduled()).toHaveLength(0);
    });

    it('should return false when cancelling unknown schedule ID', () => {
      expect(service.cancelScheduled('nonexistent')).toBe(false);
    });

    it('should not deliver cancelled notification when timer fires', async () => {
      const sendFn = vi.fn().mockResolvedValue(undefined);
      service.registerChannel(createMockChannel({ id: 'ch', sendFn }));

      const notif = service.schedule({
        channel: 'ch',
        message: 'should not deliver',
        sendAt: new Date(Date.now() + 5_000).toISOString(),
      });

      service.cancelScheduled(notif.id);
      await vi.advanceTimersByTimeAsync(5_000);

      expect(sendFn).not.toHaveBeenCalled();
    });

    it('should handle delivery failures silently', async () => {
      const sendFn = vi.fn().mockRejectedValue(new Error('delivery failed'));
      service.registerChannel(createMockChannel({ id: 'ch', sendFn }));

      service.schedule({
        channel: 'ch',
        message: 'fail-silently',
        sendAt: new Date(Date.now() + 1_000).toISOString(),
      });

      // Should not throw
      await vi.advanceTimersByTimeAsync(1_000);

      // Notification should still be cleaned up
      expect(service.getScheduled()).toHaveLength(0);
    });

    it('should preserve optional fields in the returned notification', () => {
      const notif = service.schedule({
        channel: 'email',
        message: 'msg',
        subject: 'subj',
        sendAt: '2099-01-01T00:00:00Z',
        metadata: { key: 'val' },
      });

      expect(notif.channel).toBe('email');
      expect(notif.subject).toBe('subj');
      expect(notif.metadata).toEqual({ key: 'val' });
    });
  });
});
