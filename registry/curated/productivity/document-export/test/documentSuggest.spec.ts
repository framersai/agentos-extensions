// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { DocumentSuggestTool } from '../src/tools/documentSuggest.js';
import type { DocumentSuggestInput } from '../src/types.js';

describe('DocumentSuggestTool', () => {
  const tool = new DocumentSuggestTool();
  const ctx = {} as any;

  /**
   * Helper to build a DocumentSuggestInput with sensible defaults.
   */
  function makeInput(overrides?: Partial<DocumentSuggestInput>): DocumentSuggestInput {
    return {
      responseText: 'A '.repeat(300), // 600 words by default
      wordCount: 600,
      hasTableData: false,
      hasSections: false,
      isAnalytical: false,
      ...overrides,
    };
  }

  it('should offer export with pdf and docx for 600 words of content', async () => {
    const input = makeInput({ wordCount: 600 });
    const result = await tool.execute(input, ctx);

    expect(result.success).toBe(true);
    expect(result.output?.shouldOffer).toBe(true);
    expect(result.output?.suggestedFormats).toContain('pdf');
    expect(result.output?.suggestedFormats).toContain('docx');
  });

  it('should include csv and xlsx when hasTableData is true', async () => {
    const input = makeInput({ hasTableData: true });
    const result = await tool.execute(input, ctx);

    expect(result.output?.shouldOffer).toBe(true);
    expect(result.output?.suggestedFormats).toContain('csv');
    expect(result.output?.suggestedFormats).toContain('xlsx');
  });

  it('should include pptx when hasSections is true', async () => {
    const input = makeInput({ hasSections: true });
    const result = await tool.execute(input, ctx);

    expect(result.output?.shouldOffer).toBe(true);
    expect(result.output?.suggestedFormats).toContain('pptx');
  });

  it('should include pdf and xlsx when isAnalytical is true', async () => {
    const input = makeInput({ isAnalytical: true });
    const result = await tool.execute(input, ctx);

    expect(result.output?.shouldOffer).toBe(true);
    expect(result.output?.suggestedFormats).toContain('pdf');
    expect(result.output?.suggestedFormats).toContain('xlsx');
  });

  it('should not offer export for short content with no features (100 words)', async () => {
    const input = makeInput({
      responseText: 'Short text. ',
      wordCount: 100,
      hasTableData: false,
      hasSections: false,
      isAnalytical: false,
    });
    const result = await tool.execute(input, ctx);

    expect(result.output?.shouldOffer).toBe(false);
  });

  it('should not offer export for empty input (0 words)', async () => {
    const input = makeInput({
      responseText: '',
      wordCount: 0,
      hasTableData: false,
      hasSections: false,
      isAnalytical: false,
    });
    const result = await tool.execute(input, ctx);

    expect(result.output?.shouldOffer).toBe(false);
  });

  it('should provide non-empty offerText when shouldOffer is true', async () => {
    const input = makeInput({ wordCount: 600, hasTableData: true });
    const result = await tool.execute(input, ctx);

    expect(result.output?.shouldOffer).toBe(true);
    expect(result.output?.offerText).toBeTruthy();
    expect(result.output?.offerText.length).toBeGreaterThan(0);
  });

  it('should have no duplicate formats in suggestedFormats', async () => {
    // isAnalytical adds pdf and xlsx, but wordCount > 500 already added pdf
    // so we should see no duplication
    const input = makeInput({
      wordCount: 600,
      hasTableData: true,
      hasSections: true,
      isAnalytical: true,
    });
    const result = await tool.execute(input, ctx);
    const formats = result.output?.suggestedFormats ?? [];
    const unique = [...new Set(formats)];

    expect(formats.length).toBe(unique.length);
  });
});
