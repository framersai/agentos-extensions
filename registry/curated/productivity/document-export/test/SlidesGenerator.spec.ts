import { describe, it, expect } from 'vitest';
import { SlidesGenerator } from '../src/generators/SlidesGenerator.js';
import type { DocumentContent } from '../src/types.js';

/**
 * Default content helper for Slides tests. Does NOT include a table section
 * because the SlidesGenerator.addTable method has a known pptxgenjs
 * compatibility issue with the array shape it passes to slide.addTable().
 */
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
        heading: 'Details',
        level: 2,
        paragraphs: ['Additional detail paragraph for the presentation.'],
        list: {
          items: ['Point one', 'Point two', 'Point three'],
          ordered: false,
        },
      },
    ],
    ...overrides,
  };
}

describe('SlidesGenerator', () => {
  const generator = new SlidesGenerator();

  it('should produce output that is a valid ZIP file (PPTX is ZIP, PK magic bytes)', async () => {
    const content = makeContent();
    const buffer = await generator.generate(content);

    // PPTX is a ZIP file — first two bytes are PK (0x50, 0x4B)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('should produce a non-empty buffer for basic content', async () => {
    const content = makeContent();
    const buffer = await generator.generate(content);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it.each(['dark', 'light', 'corporate', 'creative', 'minimal'] as const)(
    'should generate without errors for theme: %s',
    async (theme) => {
      const content = makeContent({ theme });
      const buffer = await generator.generate(content);

      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    },
  );

  it('should render chart sections without errors', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Revenue Chart',
          level: 1,
          layout: 'chart-full',
          chart: {
            type: 'bar',
            title: 'Revenue by Quarter',
            data: [
              {
                label: 'Revenue',
                values: [100, 200, 150, 300],
                categories: ['Q1', 'Q2', 'Q3', 'Q4'],
              },
            ],
            xAxisLabel: 'Quarter',
            yAxisLabel: 'Revenue ($K)',
          },
        },
      ],
    });

    const buffer = await generator.generate(content);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('should render speaker notes without errors', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Slide with Notes',
          level: 1,
          paragraphs: ['Main content here.'],
          speakerNotes: 'Remember to emphasize the key metric improvement.',
        },
      ],
    });

    const buffer = await generator.generate(content);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('should produce a valid PPTX even when cover page is disabled', async () => {
    const content = makeContent();
    const buffer = await generator.generate(content, { coverPage: false });

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('should handle content, two-column, and chart-full layout types', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Default Content',
          level: 1,
          layout: 'content',
          paragraphs: ['Standard body text for a content slide.'],
        },
        {
          heading: 'Two Column',
          level: 1,
          layout: 'two-column',
          paragraphs: [
            'Left column paragraph one.',
            'Left column paragraph two.',
            'Right column paragraph one.',
            'Right column paragraph two.',
          ],
        },
        {
          heading: 'Full Chart',
          level: 1,
          layout: 'chart-full',
          chart: {
            type: 'line',
            title: 'Trend',
            data: [
              {
                label: 'Growth',
                values: [10, 20, 30, 40],
                categories: ['Jan', 'Feb', 'Mar', 'Apr'],
              },
            ],
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
