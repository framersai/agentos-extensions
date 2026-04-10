// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { PdfGenerator } from '../src/generators/PdfGenerator.js';
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

describe('PdfGenerator', () => {
  const generator = new PdfGenerator();

  it('should produce output that starts with %PDF magic bytes', async () => {
    const content = makeContent();
    const buffer = await generator.generate(content);

    // PDF files must start with %PDF
    const header = buffer.subarray(0, 4).toString('ascii');
    expect(header).toBe('%PDF');
  });

  it('should produce a non-empty buffer for basic content', async () => {
    const content = makeContent();
    const buffer = await generator.generate(content);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it('should produce smaller output when cover page is disabled', async () => {
    const content = makeContent();

    const withCover = await generator.generate(content, { coverPage: true });
    const withoutCover = await generator.generate(content, { coverPage: false });

    // Without cover page should be smaller since it skips the title page
    expect(withoutCover.length).toBeLessThan(withCover.length);
  });

  it('should render tables without errors', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Table Only',
          level: 1,
          table: {
            headers: ['Col A', 'Col B', 'Col C'],
            rows: [
              ['Row 1A', 'Row 1B', 'Row 1C'],
              ['Row 2A', 'Row 2B', 'Row 2C'],
            ],
          },
        },
      ],
    });

    // Should not throw
    const buffer = await generator.generate(content);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('should render sections with all content types without errors', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Introduction',
          level: 1,
          paragraphs: [
            'This is the first paragraph.',
            'This has **bold** and *italic* formatting.',
          ],
        },
        {
          heading: 'Data Table',
          level: 2,
          table: {
            headers: ['Key', 'Value'],
            rows: [
              ['A', '1'],
              ['B', '2'],
            ],
          },
        },
        {
          heading: 'Items',
          level: 2,
          list: {
            items: ['First item', 'Second item', 'Third item'],
            ordered: false,
          },
        },
        {
          heading: 'Configuration',
          level: 2,
          keyValues: [
            { key: 'Mode', value: 'Production' },
            { key: 'Version', value: '2.0' },
          ],
        },
      ],
    });

    // Should not throw — verifying all content types render cleanly
    const buffer = await generator.generate(content);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});
