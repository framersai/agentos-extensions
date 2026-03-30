import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SendFileToChannelTool } from '../src/SendFileToChannelTool.js';
import type { ChannelContext } from '../src/types.js';

const TEST_DIR = join(tmpdir(), 'send-file-test-' + Date.now());

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(join(TEST_DIR, 'small.txt'), 'hello');
  writeFileSync(join(TEST_DIR, 'large.bin'), Buffer.alloc(60 * 1024 * 1024, 0xaa)); // 60MB
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function makeTool(platform: string = 'telegram'): SendFileToChannelTool {
  const tool = new SendFileToChannelTool();
  const sendFileFn = vi.fn().mockResolvedValue(undefined);
  tool.setChannelContext({
    platform,
    chatId: 'chat-1',
    userId: 'user-1',
    sendFileFn,
  });
  return tool;
}

describe('SendFileToChannelTool', () => {
  it('sends a file successfully', async () => {
    const tool = makeTool('telegram');
    const result = await tool.execute({ filePath: join(TEST_DIR, 'small.txt'), caption: 'Here you go' });
    expect(result.sent).toBe(true);
    expect(result.platform).toBe('telegram');
    expect(result.fileName).toBe('small.txt');
    expect(result.size).toBeGreaterThan(0);
  });

  it('returns error when file not found', async () => {
    const tool = makeTool();
    const result = await tool.execute({ filePath: '/nonexistent.txt' });
    expect(result.sent).toBe(false);
    expect(result.error).toContain('File not found');
  });

  it('returns error when no channel context', async () => {
    const tool = new SendFileToChannelTool(); // no context set
    const result = await tool.execute({ filePath: join(TEST_DIR, 'small.txt') });
    expect(result.sent).toBe(false);
    expect(result.error).toContain('No active chat channel');
  });

  it('returns error when file exceeds platform limit', async () => {
    const tool = makeTool('telegram'); // 50MB limit
    const result = await tool.execute({ filePath: join(TEST_DIR, 'large.bin') });
    expect(result.sent).toBe(false);
    expect(result.error).toContain('limit is 50MB');
    expect(result.error).toContain('compress');
  });

  it('allows large files on slack (1GB limit)', async () => {
    const tool = makeTool('slack');
    const result = await tool.execute({ filePath: join(TEST_DIR, 'large.bin') });
    expect(result.sent).toBe(true);
  });
});
