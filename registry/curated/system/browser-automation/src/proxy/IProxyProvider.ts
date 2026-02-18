/**
 * @fileoverview Interface for proxy services.
 */

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface ProxyRotationConfig {
  providers: ProxyConfig[];
  rotationStrategy: 'round-robin' | 'random' | 'sticky';
  stickyDurationMs?: number;
  geoTarget?: string;
}

export interface IProxyProvider {
  getProxy(): ProxyConfig;
  rotateProxy(): ProxyConfig;
  markFailed(server: string): void;
}
