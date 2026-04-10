// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { CsvGenerator } from '../src/generators/CsvGenerator.js';
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

describe('CsvGenerator', () => {
  const generator = new CsvGenerator();

  it('should produce valid CSV from table data with correct headers and rows', async () => {
    const content = makeContent();
    const buffer = await generator.generate(content);
    const csv = buffer.toString('utf-8');
    const lines = csv.trim().split('\n');

    // First line should be the header row
    expect(lines[0]).toContain('Name');
    expect(lines[0]).toContain('Score');
    expect(lines[0]).toContain('Grade');

    // Should have header + 3 data rows = 4 lines
    expect(lines.length).toBe(4);

    // Verify data rows contain expected values
    expect(csv).toContain('Alice');
    expect(csv).toContain('95');
    expect(csv).toContain('Bob');
    expect(csv).toContain('Charlie');
  });

  it('should concatenate multiple tables with a blank separator row', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Table 1',
          table: {
            headers: ['A', 'B'],
            rows: [['1', '2']],
          },
        },
        {
          heading: 'Table 2',
          table: {
            headers: ['C', 'D'],
            rows: [['3', '4']],
          },
        },
      ],
    });

    const buffer = await generator.generate(content);
    const csv = buffer.toString('utf-8');
    const lines = csv.trim().split('\n');

    // Table 1 header + 1 row + blank separator + Table 2 header + 1 row = 5 lines
    expect(lines.length).toBe(5);

    // Verify both tables are present
    expect(csv).toContain('A');
    expect(csv).toContain('C');

    // There should be a blank line between the two tables
    const rawLines = csv.split('\n');
    const blankLineIndex = rawLines.findIndex((line) => line.trim() === '');
    expect(blankLineIndex).toBeGreaterThan(0);
  });

  it('should produce a two-column CSV from key-values when no tables exist', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Settings',
          keyValues: [
            { key: 'Theme', value: 'Dark' },
            { key: 'Language', value: 'English' },
          ],
        },
      ],
    });

    const buffer = await generator.generate(content);
    const csv = buffer.toString('utf-8');
    const lines = csv.trim().split('\n');

    // Header (Key,Value) + 2 data rows = 3 lines
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('Key');
    expect(lines[0]).toContain('Value');
    expect(csv).toContain('Theme');
    expect(csv).toContain('Dark');
  });

  it('should throw an error with helpful message when no tabular content exists', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Intro',
          paragraphs: ['Just some text, no tables.'],
        },
      ],
    });

    await expect(generator.generate(content)).rejects.toThrow(
      /no tabular data found/i,
    );
  });

  it('should produce headers even when table rows are empty', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Empty Table',
          table: {
            headers: ['Col1', 'Col2', 'Col3'],
            rows: [],
          },
        },
      ],
    });

    const buffer = await generator.generate(content);
    const csv = buffer.toString('utf-8');
    const lines = csv.trim().split('\n');

    // Should have exactly 1 line: the headers
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Col1');
    expect(lines[0]).toContain('Col2');
    expect(lines[0]).toContain('Col3');
  });
});
