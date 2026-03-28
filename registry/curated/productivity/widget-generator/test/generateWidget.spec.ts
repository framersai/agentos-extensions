import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GenerateWidgetTool } from '../src/tools/generateWidget.js';
import { WidgetWrapper } from '../src/WidgetWrapper.js';
import { WidgetFileManager } from '../src/WidgetFileManager.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('GenerateWidgetTool', () => {
  let tempDir: string;
  let wrapper: WidgetWrapper;
  let fileManager: WidgetFileManager;
  let tool: GenerateWidgetTool;

  /** Minimal execution context stub required by the ITool interface. */
  const stubContext = {} as any;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'widget-tool-test-'));
    wrapper = new WidgetWrapper();
    fileManager = new WidgetFileManager(tempDir, 3777);
    tool = new GenerateWidgetTool(wrapper, fileManager);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('valid HTML returns success with filePath, widgetUrl, inline, html, sizeBytes', async () => {
    const result = await tool.execute(
      { html: '<div>Hello Widget</div>', title: 'Hello' },
      stubContext,
    );

    expect(result.success).toBe(true);
    expect(result).toHaveProperty('output');

    const output = (result as any).output;
    expect(output).toHaveProperty('filePath');
    expect(output).toHaveProperty('widgetUrl');
    expect(output).toHaveProperty('inline');
    expect(output).toHaveProperty('html');
    expect(output).toHaveProperty('sizeBytes');
  });

  it('HTML under 30KB sets inline to true', async () => {
    const result = await tool.execute(
      { html: '<div>Small widget</div>', title: 'Small' },
      stubContext,
    );

    expect(result.success).toBe(true);
    const output = (result as any).output;
    expect(output.inline).toBe(true);
  });

  it('HTML over 30KB sets inline to false', async () => {
    // Generate a string larger than 30KB (30 * 1024 = 30720 bytes)
    const largeContent = 'x'.repeat(35_000);
    const largeHtml = `<div>${largeContent}</div>`;

    const result = await tool.execute(
      { html: largeHtml, title: 'Large Widget' },
      stubContext,
    );

    expect(result.success).toBe(true);
    const output = (result as any).output;
    expect(output.inline).toBe(false);
  });

  it('invalid input (no HTML markers) returns error', async () => {
    const result = await tool.execute(
      { html: 'just plain text, no html markers here', title: 'Bad Input' },
      stubContext,
    );

    expect(result.success).toBe(false);
    expect(result).toHaveProperty('error');
    expect((result as any).error).toContain('Invalid widget HTML');
  });

  it('tool metadata: name is "generate_widget" and category is "productivity"', () => {
    expect(tool.name).toBe('generate_widget');
    expect(tool.category).toBe('productivity');
  });

  it('inputSchema has required "html" and "title" fields', () => {
    const schema = tool.inputSchema as any;
    expect(schema.required).toContain('html');
    expect(schema.required).toContain('title');
    expect(schema.properties).toHaveProperty('html');
    expect(schema.properties).toHaveProperty('title');
  });

  it('output html contains error boundary script (wrapper was applied)', async () => {
    const result = await tool.execute(
      { html: '<div>Test</div>', title: 'Boundary Test' },
      stubContext,
    );

    expect(result.success).toBe(true);
    const output = (result as any).output;
    expect(output.html).toContain('window.onerror');
  });

  it('output html contains DOCTYPE (wrapper was applied)', async () => {
    const result = await tool.execute(
      { html: '<div>Doctype Test</div>', title: 'DOCTYPE Test' },
      stubContext,
    );

    expect(result.success).toBe(true);
    const output = (result as any).output;
    expect(output.html).toContain('<!DOCTYPE html>');
  });
});
