/**
 * @fileoverview Proxy rotation manager with round-robin, random, and sticky strategies.
 */

import type { IProxyProvider, ProxyConfig, ProxyRotationConfig } from './IProxyProvider.js';

export class ProxyManager implements IProxyProvider {
  private config: ProxyRotationConfig;
  private currentIndex = 0;
  private failedServers: Set<string> = new Set();
  private stickyProxy: ProxyConfig | null = null;
  private stickyExpiry: number = 0;

  constructor(config: ProxyRotationConfig) {
    this.config = config;
  }

  getProxy(): ProxyConfig {
    const { rotationStrategy, stickyDurationMs } = this.config;

    if (rotationStrategy === 'sticky' && this.stickyProxy && Date.now() < this.stickyExpiry) {
      return this.stickyProxy;
    }

    const available = this.config.providers.filter((p) => !this.failedServers.has(p.server));
    if (available.length === 0) {
      // Reset failed list if all are failed
      this.failedServers.clear();
      return this.config.providers[0];
    }

    let proxy: ProxyConfig;

    switch (rotationStrategy) {
      case 'random':
        proxy = available[Math.floor(Math.random() * available.length)];
        break;
      case 'sticky':
        proxy = available[0];
        this.stickyProxy = proxy;
        this.stickyExpiry = Date.now() + (stickyDurationMs ?? 300_000);
        break;
      case 'round-robin':
      default:
        this.currentIndex = this.currentIndex % available.length;
        proxy = available[this.currentIndex];
        this.currentIndex++;
        break;
    }

    return proxy;
  }

  rotateProxy(): ProxyConfig {
    this.stickyProxy = null;
    this.stickyExpiry = 0;
    this.currentIndex++;
    return this.getProxy();
  }

  markFailed(server: string): void {
    this.failedServers.add(server);
    if (this.stickyProxy?.server === server) {
      this.stickyProxy = null;
    }
  }

  getStats(): { total: number; available: number; failed: number } {
    return {
      total: this.config.providers.length,
      available: this.config.providers.filter((p) => !this.failedServers.has(p.server)).length,
      failed: this.failedServers.size,
    };
  }
}
