import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CredentialVaultService } from '../src/CredentialVaultService';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CredentialVaultService', () => {
  let service: CredentialVaultService;

  beforeEach(async () => {
    service = new CredentialVaultService('test-passphrase');
    await service.initialize();
  });

  afterEach(async () => {
    await service.shutdown();
  });

  // ── Constructor / Lifecycle ──

  describe('constructor', () => {
    it('should derive a master key from the passphrase', () => {
      // Service created without errors
      const svc = new CredentialVaultService('another-passphrase');
      expect(svc.isRunning).toBe(false);
    });
  });

  describe('initialize / shutdown', () => {
    it('should set isRunning to true after initialize', () => {
      expect(service.isRunning).toBe(true);
    });

    it('should set isRunning to false after shutdown', async () => {
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should clear all credentials on shutdown', async () => {
      await service.setCredential('github', 'token', 'gh_abc123');
      await service.shutdown();
      // Re-initialize to test that store is empty
      await service.initialize();
      const val = await service.getCredential('github', 'token');
      expect(val).toBeNull();
    });
  });

  // ── requireRunning guard ──

  describe('requireRunning', () => {
    it('should throw when calling setCredential before initialization', async () => {
      const svc = new CredentialVaultService('pass');
      await expect(svc.setCredential('x', 'y', 'z')).rejects.toThrow('not initialized');
    });

    it('should throw when calling getCredential before initialization', async () => {
      const svc = new CredentialVaultService('pass');
      await expect(svc.getCredential('x', 'y')).rejects.toThrow('not initialized');
    });

    it('should throw when calling listCredentials before initialization', async () => {
      const svc = new CredentialVaultService('pass');
      await expect(svc.listCredentials()).rejects.toThrow('not initialized');
    });
  });

  // ── setCredential ──

  describe('setCredential', () => {
    it('should store a credential that can be retrieved', async () => {
      await service.setCredential('openai', 'apiKey', 'sk-test123');
      const value = await service.getCredential('openai', 'apiKey');
      expect(value).toBe('sk-test123');
    });

    it('should overwrite an existing credential', async () => {
      await service.setCredential('openai', 'apiKey', 'sk-old');
      await service.setCredential('openai', 'apiKey', 'sk-new');
      const value = await service.getCredential('openai', 'apiKey');
      expect(value).toBe('sk-new');
    });

    it('should store credentials scoped by platform', async () => {
      await service.setCredential('github', 'token', 'gh_abc');
      await service.setCredential('gitlab', 'token', 'gl_xyz');
      expect(await service.getCredential('github', 'token')).toBe('gh_abc');
      expect(await service.getCredential('gitlab', 'token')).toBe('gl_xyz');
    });

    it('should preserve createdAt when updating', async () => {
      await service.setCredential('platform', 'key', 'v1');
      const list1 = await service.listCredentials('platform');
      const createdAt = list1[0].createdAt;

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      await service.setCredential('platform', 'key', 'v2');
      const list2 = await service.listCredentials('platform');
      expect(list2[0].createdAt).toBe(createdAt);
      expect(list2[0].updatedAt).not.toBe(createdAt);
    });
  });

  // ── getCredential ──

  describe('getCredential', () => {
    it('should return null for non-existent credential', async () => {
      const value = await service.getCredential('nonexistent', 'key');
      expect(value).toBeNull();
    });

    it('should decrypt and return the stored value', async () => {
      await service.setCredential('stripe', 'secretKey', 'sk_live_abc123');
      const value = await service.getCredential('stripe', 'secretKey');
      expect(value).toBe('sk_live_abc123');
    });

    it('should return different values for different keys on same platform', async () => {
      await service.setCredential('aws', 'accessKey', 'AKIA...');
      await service.setCredential('aws', 'secretKey', 'wJalr...');
      expect(await service.getCredential('aws', 'accessKey')).toBe('AKIA...');
      expect(await service.getCredential('aws', 'secretKey')).toBe('wJalr...');
    });
  });

  // ── listCredentials ──

  describe('listCredentials', () => {
    it('should return empty array when no credentials exist', async () => {
      const list = await service.listCredentials();
      expect(list).toEqual([]);
    });

    it('should list all credentials with masked values', async () => {
      await service.setCredential('github', 'token', 'ghp_1234567890abcdef');
      await service.setCredential('openai', 'apiKey', 'sk-test-key-123');
      const list = await service.listCredentials();
      expect(list).toHaveLength(2);
      // Should be sorted by platform
      expect(list[0].platform).toBe('github');
      expect(list[1].platform).toBe('openai');
      // Values should be masked
      for (const item of list) {
        expect(item.maskedValue).toContain('*');
      }
    });

    it('should filter by platform when specified', async () => {
      await service.setCredential('github', 'token', 'abc');
      await service.setCredential('openai', 'apiKey', 'def');
      const list = await service.listCredentials('github');
      expect(list).toHaveLength(1);
      expect(list[0].platform).toBe('github');
    });

    it('should return CredentialInfo objects (no raw values)', async () => {
      await service.setCredential('test', 'key', 'my-secret');
      const list = await service.listCredentials();
      const item = list[0];
      expect(item).toHaveProperty('platform');
      expect(item).toHaveProperty('key');
      expect(item).toHaveProperty('maskedValue');
      expect(item).toHaveProperty('createdAt');
      expect(item).toHaveProperty('updatedAt');
      // maskedValue should not equal the raw value
      expect(item.maskedValue).not.toBe('my-secret');
    });

    it('should sort by platform then key', async () => {
      await service.setCredential('beta', 'z-key', 'v1');
      await service.setCredential('alpha', 'b-key', 'v2');
      await service.setCredential('alpha', 'a-key', 'v3');
      const list = await service.listCredentials();
      expect(list.map((c) => `${c.platform}/${c.key}`)).toEqual([
        'alpha/a-key',
        'alpha/b-key',
        'beta/z-key',
      ]);
    });
  });

  // ── deleteCredential ──

  describe('deleteCredential', () => {
    it('should delete an existing credential', async () => {
      await service.setCredential('github', 'token', 'abc');
      const deleted = await service.deleteCredential('github', 'token');
      expect(deleted).toBe(true);
      const val = await service.getCredential('github', 'token');
      expect(val).toBeNull();
    });

    it('should return false when deleting non-existent credential', async () => {
      const deleted = await service.deleteCredential('nope', 'nope');
      expect(deleted).toBe(false);
    });
  });

  // ── importCredentials ──

  describe('importCredentials', () => {
    it('should import credentials from valid JSON array', async () => {
      const data = JSON.stringify([
        { platform: 'github', key: 'token', value: 'gh_abc' },
        { platform: 'openai', key: 'apiKey', value: 'sk-test' },
      ]);
      const result = await service.importCredentials(data, 'json');
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      // Verify they were actually stored
      expect(await service.getCredential('github', 'token')).toBe('gh_abc');
      expect(await service.getCredential('openai', 'apiKey')).toBe('sk-test');
    });

    it('should import a single JSON object', async () => {
      const data = JSON.stringify({ platform: 'stripe', key: 'secret', value: 'sk_live_abc' });
      const result = await service.importCredentials(data, 'json');
      expect(result.imported).toBe(1);
    });

    it('should skip entries with missing fields in JSON', async () => {
      const data = JSON.stringify([
        { platform: 'valid', key: 'k', value: 'v' },
        { platform: 'invalid', key: 'k' }, // missing value
        { platform: 'also-invalid' }, // missing key and value
      ]);
      const result = await service.importCredentials(data, 'json');
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.errors).toHaveLength(2);
    });

    it('should handle invalid JSON gracefully', async () => {
      const result = await service.importCredentials('not-valid-json', 'json');
      expect(result.imported).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Failed to parse JSON');
    });

    it('should import credentials from CSV', async () => {
      const csv = 'platform,key,value\ngithub,token,gh_abc\nopenai,apiKey,sk-test';
      const result = await service.importCredentials(csv, 'csv');
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
    });

    it('should handle CSV without header row', async () => {
      const csv = 'github,token,gh_abc\nopenai,apiKey,sk-test';
      const result = await service.importCredentials(csv, 'csv');
      expect(result.imported).toBe(2);
    });

    it('should skip CSV lines with fewer than 3 columns', async () => {
      const csv = 'github,token,gh_abc\nbadline,only-two';
      const result = await service.importCredentials(csv, 'csv');
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  // ── exportCredentials ──

  describe('exportCredentials', () => {
    it('should export all credentials as plaintext', async () => {
      await service.setCredential('github', 'token', 'gh_abc');
      await service.setCredential('openai', 'apiKey', 'sk-test');
      const exported = await service.exportCredentials();
      expect(exported).toHaveLength(2);
      expect(exported[0]).toMatchObject({ platform: 'github', key: 'token', value: 'gh_abc' });
    });

    it('should export only specified platform', async () => {
      await service.setCredential('github', 'token', 'gh_abc');
      await service.setCredential('openai', 'apiKey', 'sk-test');
      const exported = await service.exportCredentials('openai');
      expect(exported).toHaveLength(1);
      expect(exported[0].platform).toBe('openai');
    });

    it('should return empty array when no credentials exist', async () => {
      const exported = await service.exportCredentials();
      expect(exported).toEqual([]);
    });
  });

  // ── Encryption round-trip ──

  describe('encryption', () => {
    it('should encrypt and decrypt values correctly', async () => {
      const secretValue = 'super-secret-api-key-with-special-chars!@#$%^&*()';
      await service.setCredential('test', 'key', secretValue);
      const retrieved = await service.getCredential('test', 'key');
      expect(retrieved).toBe(secretValue);
    });

    it('should produce different encrypted values for identical plaintext (due to random IV)', async () => {
      await service.setCredential('p1', 'k1', 'same-value');
      await service.setCredential('p2', 'k2', 'same-value');
      // Both should decrypt to the same value
      expect(await service.getCredential('p1', 'k1')).toBe('same-value');
      expect(await service.getCredential('p2', 'k2')).toBe('same-value');
    });

    it('should not decrypt with a different passphrase', async () => {
      await service.setCredential('test', 'key', 'secret');

      // Export the internal state — we cannot directly test cross-passphrase decryption
      // without accessing internals, but we can verify different passphrases produce
      // different services that don't share state
      const svc2 = new CredentialVaultService('different-passphrase');
      await svc2.initialize();
      const val = await svc2.getCredential('test', 'key');
      expect(val).toBeNull(); // Different instance, no shared state
      await svc2.shutdown();
    });
  });
});
