import { describe, it, expect } from 'vitest';
import { DocxGenerator } from '../src/generators/DocxGenerator.js';
import type { DocumentContent } from '../src/types.js';

function makeContent(overrides?: Partial<DocumentContent>): DocumentContent {
  return {
    title: 'Test Report',
    author: 'Test Author',
    date: '2026-03-28',
    sections: [
      {
        heading: 'Summary',
        level: 1,
        paragraphs: ['This is a test paragraph with **bold** and *italic* text.'],
      },
      {
        heading: 'Data',
        level: 2,
        table: {
          headers: ['Name', 'Score', 'Grade'],
          rows: [
            ['Alice', '95', 'A'],
            ['Bob', '87', 'B+'],
            ['Charlie', '72', 'C'],
          ],
        },
      },
    ],
    ...overrides,
  };
}

describe('DocxGenerator', () => {
  const generator = new DocxGenerator();

  it('should produce output that is a valid ZIP file (PK magic bytes)', async () => {
    const content = makeContent();
    const buffer = await generator.generate(content);

    // DOCX is a ZIP file — first two bytes are PK (0x50, 0x4B)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('should produce a non-empty buffer for basic content', async () => {
    const content = makeContent();
    const buffer = await generator.generate(content);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it('should generate cover page content without errors', async () => {
    const content = makeContent({
      subtitle: 'A Comprehensive Test',
    });

    const withCover = await generator.generate(content, { coverPage: true });
    const withoutCover = await generator.generate(content, { coverPage: false });

    // Both should produce valid ZIP files
    expect(withCover[0]).toBe(0x50);
    expect(withCover[1]).toBe(0x4b);
    expect(withoutCover[0]).toBe(0x50);
    expect(withoutCover[1]).toBe(0x4b);

    // Cover page should add content, making the buffer larger
    expect(withCover.length).toBeGreaterThan(withoutCover.length);
  });

  it('should generate tables, lists, and key-values without throwing', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Data Table',
          level: 1,
          table: {
            headers: ['Category', 'Value'],
            rows: [
              ['Sales', '1200'],
              ['Marketing', '800'],
            ],
          },
        },
        {
          heading: 'Steps',
          level: 2,
          list: {
            items: ['Step one', 'Step two', 'Step three'],
            ordered: true,
          },
        },
        {
          heading: 'Metadata',
          level: 2,
          keyValues: [
            { key: 'Status', value: 'Active' },
            { key: 'Priority', value: 'High' },
          ],
        },
      ],
    });

    const buffer = await generator.generate(content);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('should handle image sections with base64 data without throwing', async () => {
    // Minimal 1x1 pixel transparent PNG as base64
    const tinyPngBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    const content = makeContent({
      sections: [
        {
          heading: 'Image Section',
          level: 1,
          image: {
            base64: tinyPngBase64,
            caption: 'A test image',
            width: 200,
          },
        },
      ],
    });

    const buffer = await generator.generate(content);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});
