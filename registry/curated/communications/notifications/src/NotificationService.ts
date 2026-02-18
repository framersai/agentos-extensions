/**
 * @fileoverview Unified multi-channel notification service.
 *
 * Manages a registry of notification channels, routes messages to the
 * best-priority channel, supports broadcasting to all channels, and
 * provides in-memory scheduled notification delivery.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationChannel {
  /** Unique channel identifier (e.g. "email", "slack", "telegram"). */
  id: string;
  /** Human-readable channel name. */
  name: string;
  /** Higher priority channels are preferred when no explicit channel is specified. */
  priority: number;
  /** Sends a notification through this channel. */
  sendFn: (message: string, opts?: { subject?: string; metadata?: Record<string, unknown> }) => Promise<void>;
}

export interface SendOptions {
  /** Target channel id. If omitted, the highest-priority channel is used. */
  channel?: string;
  /** Notification body text. */
  message: string;
  /** Optional subject / title. */
  subject?: string;
  /** Arbitrary metadata forwarded to the channel sendFn. */
  metadata?: Record<string, unknown>;
}

export interface BroadcastOptions {
  /** Notification body text. */
  message: string;
  /** Optional subject / title. */
  subject?: string;
  /** Subset of channel ids to target. If omitted, all registered channels are used. */
  channels?: string[];
  /** Arbitrary metadata forwarded to every channel sendFn. */
  metadata?: Record<string, unknown>;
}

export interface ScheduleOptions {
  /** Target channel id (optional — uses highest priority if omitted). */
  channel?: string;
  /** Notification body text. */
  message: string;
  /** Optional subject / title. */
  subject?: string;
  /** ISO 8601 timestamp for when to send the notification. */
  sendAt: string;
  /** Arbitrary metadata forwarded to the channel sendFn. */
  metadata?: Record<string, unknown>;
}

export interface ScheduledNotification {
  id: string;
  channel?: string;
  message: string;
  subject?: string;
  sendAt: string;
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  channelId: string;
  channelName: string;
  delivered: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class NotificationService {
  private channels: Map<string, NotificationChannel> = new Map();
  private scheduled: Map<string, { notification: ScheduledNotification; timer: NodeJS.Timeout }> = new Map();
  private running = false;

  // ── Lifecycle ──

  async initialize(): Promise<void> {
    this.running = true;
  }

  async shutdown(): Promise<void> {
    // Cancel all pending scheduled notifications
    for (const [, entry] of this.scheduled) {
      clearTimeout(entry.timer);
    }
    this.scheduled.clear();
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Channel Registry ──

  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.id, channel);
  }

  unregisterChannel(id: string): boolean {
    return this.channels.delete(id);
  }

  listChannels(): NotificationChannel[] {
    return Array.from(this.channels.values()).sort((a, b) => b.priority - a.priority);
  }

  // ── Send ──

  async send(opts: SendOptions): Promise<SendResult> {
    const channel = opts.channel
      ? this.channels.get(opts.channel)
      : this.getBestChannel();

    if (!channel) {
      throw new Error(
        opts.channel
          ? `Notification channel "${opts.channel}" not found`
          : 'No notification channels registered'
      );
    }

    try {
      await channel.sendFn(opts.message, { subject: opts.subject, metadata: opts.metadata });
      return { channelId: channel.id, channelName: channel.name, delivered: true };
    } catch (err: any) {
      return { channelId: channel.id, channelName: channel.name, delivered: false, error: err.message };
    }
  }

  // ── Broadcast ──

  async broadcast(opts: BroadcastOptions): Promise<SendResult[]> {
    const targets = opts.channels
      ? opts.channels.map(id => this.channels.get(id)).filter(Boolean) as NotificationChannel[]
      : Array.from(this.channels.values());

    if (targets.length === 0) {
      throw new Error('No notification channels available for broadcast');
    }

    const results: SendResult[] = [];
    for (const channel of targets) {
      try {
        await channel.sendFn(opts.message, { subject: opts.subject, metadata: opts.metadata });
        results.push({ channelId: channel.id, channelName: channel.name, delivered: true });
      } catch (err: any) {
        results.push({ channelId: channel.id, channelName: channel.name, delivered: false, error: err.message });
      }
    }

    return results;
  }

  // ── Schedule ──

  schedule(opts: ScheduleOptions): ScheduledNotification {
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const notification: ScheduledNotification = {
      id,
      channel: opts.channel,
      message: opts.message,
      subject: opts.subject,
      sendAt: opts.sendAt,
      metadata: opts.metadata,
    };

    const delay = new Date(opts.sendAt).getTime() - Date.now();
    const effectiveDelay = Math.max(delay, 0);

    const timer = setTimeout(async () => {
      try {
        await this.send({
          channel: opts.channel,
          message: opts.message,
          subject: opts.subject,
          metadata: opts.metadata,
        });
      } catch {
        // Scheduled notification delivery failed — logged silently
      }
      this.scheduled.delete(id);
    }, effectiveDelay);

    this.scheduled.set(id, { notification, timer });
    return notification;
  }

  cancelScheduled(scheduleId: string): boolean {
    const entry = this.scheduled.get(scheduleId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.scheduled.delete(scheduleId);
    return true;
  }

  getScheduled(): ScheduledNotification[] {
    return Array.from(this.scheduled.values()).map(e => e.notification);
  }

  // ── Internal ──

  private getBestChannel(): NotificationChannel | undefined {
    let best: NotificationChannel | undefined;
    for (const channel of this.channels.values()) {
      if (!best || channel.priority > best.priority) {
        best = channel;
      }
    }
    return best;
  }
}
