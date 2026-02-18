/**
 * @fileoverview Credential Vault service layer.
 *
 * Provides AES-256-GCM encrypted in-memory credential storage
 * with platform-scoped keys, rotation, and import/export support.
 * Uses Node.js built-in crypto module (no external dependencies).
 */

import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CredentialEntry {
  platform: string;
  key: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  createdAt: string;
  updatedAt: string;
  rotatedAt?: string;
}

export interface CredentialInfo {
  platform: string;
  key: string;
  maskedValue: string;
  createdAt: string;
  updatedAt: string;
  rotatedAt?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CredentialVaultService {
  private store: Map<string, CredentialEntry> = new Map();
  private masterKey: Buffer;
  private running = false;

  constructor(passphrase: string) {
    // Derive a 256-bit key from the passphrase using scrypt
    this.masterKey = crypto.scryptSync(passphrase, 'agentos-credential-vault-salt', 32);
  }

  async initialize(): Promise<void> {
    this.running = true;
  }

  async shutdown(): Promise<void> {
    // Clear all credentials from memory on shutdown
    this.store.clear();
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Set Credential ──

  async setCredential(platform: string, key: string, value: string): Promise<void> {
    this.requireRunning();

    const { encrypted, iv, authTag } = this.encrypt(value);
    const storeKey = this.buildKey(platform, key);
    const now = new Date().toISOString();

    const existing = this.store.get(storeKey);

    this.store.set(storeKey, {
      platform,
      key,
      encryptedValue: encrypted,
      iv,
      authTag,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      rotatedAt: existing?.rotatedAt,
    });
  }

  // ── Get Credential ──

  async getCredential(platform: string, key: string): Promise<string | null> {
    this.requireRunning();

    const storeKey = this.buildKey(platform, key);
    const entry = this.store.get(storeKey);

    if (!entry) return null;

    return this.decrypt(entry.encryptedValue, entry.iv, entry.authTag);
  }

  // ── List Credentials ──

  async listCredentials(platform?: string): Promise<CredentialInfo[]> {
    this.requireRunning();

    const results: CredentialInfo[] = [];

    for (const entry of this.store.values()) {
      if (platform && entry.platform !== platform) continue;

      // Decrypt to get value length for masking, then discard
      const value = this.decrypt(entry.encryptedValue, entry.iv, entry.authTag);
      const maskedValue = this.maskValue(value);

      results.push({
        platform: entry.platform,
        key: entry.key,
        maskedValue,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        rotatedAt: entry.rotatedAt,
      });
    }

    return results.sort((a, b) => {
      const cmp = a.platform.localeCompare(b.platform);
      return cmp !== 0 ? cmp : a.key.localeCompare(b.key);
    });
  }

  // ── Delete Credential ──

  async deleteCredential(platform: string, key: string): Promise<boolean> {
    this.requireRunning();

    const storeKey = this.buildKey(platform, key);
    return this.store.delete(storeKey);
  }

  // ── Import Credentials ──

  async importCredentials(
    data: string,
    format: 'json' | 'csv' = 'json',
  ): Promise<ImportResult> {
    this.requireRunning();

    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

    if (format === 'json') {
      try {
        const parsed = JSON.parse(data);
        const entries: Array<{ platform: string; key: string; value: string }> = Array.isArray(parsed) ? parsed : [parsed];

        for (const entry of entries) {
          if (!entry.platform || !entry.key || !entry.value) {
            result.errors.push(`Invalid entry: missing platform, key, or value`);
            result.skipped++;
            continue;
          }

          try {
            await this.setCredential(entry.platform, entry.key, entry.value);
            result.imported++;
          } catch (err: any) {
            result.errors.push(`Failed to import ${entry.platform}/${entry.key}: ${err.message}`);
            result.skipped++;
          }
        }
      } catch (err: any) {
        result.errors.push(`Failed to parse JSON: ${err.message}`);
      }
    } else if (format === 'csv') {
      const lines = data.split('\n').filter((l) => l.trim());

      // Skip header row if present
      const startIdx = lines[0]?.toLowerCase().includes('platform') ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const parts = this.parseCsvLine(lines[i]);

        if (parts.length < 3) {
          result.errors.push(`Line ${i + 1}: expected at least 3 columns (platform, key, value)`);
          result.skipped++;
          continue;
        }

        const [platform, key, value] = parts;

        try {
          await this.setCredential(platform.trim(), key.trim(), value.trim());
          result.imported++;
        } catch (err: any) {
          result.errors.push(`Line ${i + 1}: ${err.message}`);
          result.skipped++;
        }
      }
    }

    return result;
  }

  // ── Export Credentials ──

  async exportCredentials(platform?: string): Promise<Array<{ platform: string; key: string; value: string }>> {
    this.requireRunning();

    const exported: Array<{ platform: string; key: string; value: string }> = [];

    for (const entry of this.store.values()) {
      if (platform && entry.platform !== platform) continue;

      const value = this.decrypt(entry.encryptedValue, entry.iv, entry.authTag);
      exported.push({ platform: entry.platform, key: entry.key, value });
    }

    return exported.sort((a, b) => {
      const cmp = a.platform.localeCompare(b.platform);
      return cmp !== 0 ? cmp : a.key.localeCompare(b.key);
    });
  }

  // ── Private: Encryption ──

  private encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  private decrypt(encryptedHex: string, ivHex: string, authTagHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // ── Private: Helpers ──

  private buildKey(platform: string, key: string): string {
    return `${platform}::${key}`;
  }

  private maskValue(value: string): string {
    if (value.length <= 4) return '****';
    const visibleLen = Math.min(4, Math.floor(value.length * 0.2));
    return value.slice(0, visibleLen) + '*'.repeat(Math.max(4, value.length - visibleLen));
  }

  private parseCsvLine(line: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    parts.push(current);
    return parts;
  }

  private requireRunning(): void {
    if (!this.running) throw new Error('CredentialVaultService not initialized');
  }
}
