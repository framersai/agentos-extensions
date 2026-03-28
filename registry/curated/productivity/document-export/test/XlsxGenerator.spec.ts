import { describe, it, expect } from 'vitest';
import { XlsxGenerator } from '../src/generators/XlsxGenerator.js';
import ExcelJS from 'exceljs';
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

describe('XlsxGenerator', () => {
  const generator = new XlsxGenerator();

  it('should produce a valid XLSX buffer that ExcelJS can read back', async () => {
    const content = makeContent();
    const buffer = await generator.generate(content);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    // Read it back with ExcelJS to verify it's valid
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.length).toBeGreaterThanOrEqual(1);

    const sheet = workbook.worksheets[0];
    // Header row should contain expected values
    const headerRow = sheet.getRow(1);
    expect(headerRow.getCell(1).value).toBe('Name');
    expect(headerRow.getCell(2).value).toBe('Score');
    expect(headerRow.getCell(3).value).toBe('Grade');

    // Data rows should be present
    const dataRow1 = sheet.getRow(2);
    expect(dataRow1.getCell(1).value).toBe('Alice');
  });

  it('should style the header row with bold font', async () => {
    const content = makeContent();
    const buffer = await generator.generate(content);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    const headerRow = sheet.getRow(1);

    // The header row font should be bold
    expect(headerRow.font?.bold).toBe(true);
  });

  it('should create multiple sheets for multiple tables', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Sales',
          table: {
            headers: ['Product', 'Revenue'],
            rows: [['Widget', '1000']],
          },
        },
        {
          heading: 'Costs',
          table: {
            headers: ['Item', 'Amount'],
            rows: [['Materials', '500']],
          },
        },
      ],
    });

    const buffer = await generator.generate(content);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.length).toBe(2);
    expect(workbook.worksheets[0].name).toBe('Sales');
    expect(workbook.worksheets[1].name).toBe('Costs');
  });

  it('should sanitize sheet names by removing special characters and truncating to 31 chars', async () => {
    const longHeading = 'This is a very long heading name that exceeds the thirty-one char limit';
    const specialCharsHeading = 'Data [2026] / Q1?';

    const content = makeContent({
      sections: [
        {
          heading: longHeading,
          table: {
            headers: ['X'],
            rows: [['1']],
          },
        },
        {
          heading: specialCharsHeading,
          table: {
            headers: ['Y'],
            rows: [['2']],
          },
        },
      ],
    });

    const buffer = await generator.generate(content);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    // First sheet name should be truncated to 31 characters
    expect(workbook.worksheets[0].name.length).toBeLessThanOrEqual(31);

    // Second sheet name should have special chars replaced with underscores
    const name = workbook.worksheets[1].name;
    expect(name).not.toContain('[');
    expect(name).not.toContain(']');
    expect(name).not.toContain('/');
    expect(name).not.toContain('?');
  });

  it('should detect numeric cells and store them as numbers', async () => {
    const content = makeContent({
      sections: [
        {
          heading: 'Numbers',
          table: {
            headers: ['Label', 'Value'],
            rows: [
              ['A', '100'],
              ['B', '200.5'],
              ['C', '300'],
            ],
          },
        },
      ],
    });

    const buffer = await generator.generate(content);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];

    // Row 2 (first data row), column 2 should be a number
    const cell = sheet.getRow(2).getCell(2);
    expect(typeof cell.value).toBe('number');
    expect(cell.value).toBe(100);

    // Row 3, column 2 should also be a number (float)
    const floatCell = sheet.getRow(3).getCell(2);
    expect(typeof floatCell.value).toBe('number');
    expect(floatCell.value).toBe(200.5);
  });
});
