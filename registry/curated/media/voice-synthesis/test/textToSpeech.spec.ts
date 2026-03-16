import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Clear env vars that affect provider detection
const savedEnv: Record<string, string | undefined> = {};
const envKeys = ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'OPENAI_BASE_URL', 'OLLAMA_BASE_URL', 'TTS_PROVIDER'];

const { TextToSpeechTool } = await import('../src/tools/textToSpeech.js');
const { createExtensionPack } = await import('../src/index.js');

describe('TextToSpeechTool', () => {
  const ctx = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Save and clear env
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore env
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      else delete process.env[key];
    }
  });

  describe('metadata', () => {
    it('has correct id and name', () => {
      const tool = new TextToSpeechTool({ openaiApiKey: 'sk-test' });
      expect(tool.id).toBe('tts-multi-provider-v1');
      expect(tool.name).toBe('text_to_speech');
    });

    it('has valid input schema with text required', () => {
      const tool = new TextToSpeechTool({});
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.required).toContain('text');
    });

    it('has no side effects', () => {
      const tool = new TextToSpeechTool({});
      expect(tool.hasSideEffects).toBe(false);
    });

    it('describes multiple providers', () => {
      const tool = new TextToSpeechTool({});
      expect(tool.description).toContain('OpenAI');
      expect(tool.description).toContain('ElevenLabs');
    });
  });

  describe('provider resolution', () => {
    it('falls back to Ollama when no API keys set', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: '', elevenLabsApiKey: '' });
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const result = await tool.execute({ text: 'Hello' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Ollama');
    });

    it('auto-detects OpenAI when key provided', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: 'sk-test', elevenLabsApiKey: '' });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });
      const result = await tool.execute({ text: 'Hello' }, ctx);
      expect(result.success).toBe(true);
      expect(result.output!.provider).toBe('openai');
    });

    it('auto-detects ElevenLabs when only that key set', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: '', elevenLabsApiKey: 'el-test' });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });
      const result = await tool.execute({ text: 'Hello' }, ctx);
      expect(result.success).toBe(true);
      expect(result.output!.provider).toBe('elevenlabs');
    });

    it('respects explicit provider override', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: 'sk-test', elevenLabsApiKey: 'el-test' });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });
      const result = await tool.execute({ text: 'Hello', provider: 'elevenlabs' }, ctx);
      expect(result.success).toBe(true);
      expect(result.output!.provider).toBe('elevenlabs');
    });
  });

  describe('OpenAI TTS', () => {
    it('synthesizes with default voice (nova)', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: 'sk-test', elevenLabsApiKey: '' });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });
      const result = await tool.execute({ text: 'Hello world' }, ctx);
      expect(result.success).toBe(true);
      expect(result.output!.voice).toBe('nova');
      expect(result.output!.provider).toBe('openai');
      expect(result.output!.contentType).toBe('audio/mpeg');
      expect(result.output!.audioBase64).toBeTruthy();
    });

    it('sends correct request to OpenAI API', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: 'sk-test', elevenLabsApiKey: '' });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) });
      await tool.execute({ text: 'Test', voice: 'shimmer', model: 'tts-1-hd' }, ctx);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/audio/speech');
      const body = JSON.parse(opts.body);
      expect(body.voice).toBe('shimmer');
      expect(body.model).toBe('tts-1-hd');
    });

    it('handles API errors', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: 'sk-test', elevenLabsApiKey: '' });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
      const result = await tool.execute({ text: 'Test' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });
  });

  describe('ElevenLabs TTS', () => {
    it('synthesizes with default voice (rachel)', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: '', elevenLabsApiKey: 'el-test' });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });
      const result = await tool.execute({ text: 'Hello world' }, ctx);
      expect(result.success).toBe(true);
      expect(result.output!.voice).toBe('rachel');
      expect(result.output!.provider).toBe('elevenlabs');
    });

    it('uses correct voice ID for named voice (josh)', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: '', elevenLabsApiKey: 'el-test' });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) });
      await tool.execute({ text: 'Test', voice: 'josh' }, ctx);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('TxGEqnHWrfWFTfGW9XjX'),
        expect.any(Object)
      );
    });

    it('sends ElevenLabs API key header', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: '', elevenLabsApiKey: 'el-test' });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) });
      await tool.execute({ text: 'Test' }, ctx);
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['xi-api-key']).toBe('el-test');
    });
  });

  describe('common behavior', () => {
    it('truncates text to 5000 chars', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: 'sk-test', elevenLabsApiKey: '' });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) });
      const result = await tool.execute({ text: 'a'.repeat(6000) }, ctx);
      expect(result.success).toBe(true);
      expect(result.output!.text.length).toBe(5000);
    });

    it('estimates duration from word count', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: 'sk-test', elevenLabsApiKey: '' });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) });
      const result = await tool.execute({ text: 'one two three four five' }, ctx);
      expect(result.success).toBe(true);
      expect(result.output!.durationEstimateMs).toBeGreaterThan(0);
    });

    it('handles network errors gracefully', async () => {
      const tool = new TextToSpeechTool({ openaiApiKey: 'sk-test', elevenLabsApiKey: '' });
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const result = await tool.execute({ text: 'Test' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('TTS failed');
    });
  });
});

describe('createExtensionPack', () => {
  it('creates pack with correct metadata', () => {
    const pack = createExtensionPack({ options: { elevenLabsApiKey: 'test' }, logger: { info: vi.fn() } });
    expect(pack.name).toBe('@framers/agentos-ext-voice-synthesis');
    expect(pack.version).toBe('2.0.0');
    expect(pack.descriptors).toHaveLength(1);
    expect(pack.descriptors[0].kind).toBe('tool');
    expect(pack.descriptors[0].id).toBe('text_to_speech');
  });
});
