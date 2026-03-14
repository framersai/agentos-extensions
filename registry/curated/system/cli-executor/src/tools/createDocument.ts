/**
 * Create Document Tool
 * Generate DOCX files from text or markdown content.
 *
 * Uses the 'docx' npm package (MIT) for full .docx generation with
 * headings, paragraphs, bold/italic, bullet lists, and tables.
 *
 * @module @framers/agentos-ext-cli-executor
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';

// ── Lightweight Markdown → docx AST ────────────────────────────────────────

interface DocParagraph {
  type: 'heading' | 'paragraph' | 'bullet';
  level?: number; // heading level 1-6
  runs: DocRun[];
}

interface DocRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/**
 * Parse a subset of Markdown into a flat list of paragraphs.
 *
 * Supported:
 * - # H1 through ###### H6
 * - **bold** and *italic*
 * - Unordered lists: - item / * item
 * - Blank lines become paragraph breaks
 * - Everything else is a normal paragraph
 */
function parseMarkdown(md: string): DocParagraph[] {
  const lines = md.split('\n');
  const result: DocParagraph[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Blank line — skip (paragraph separation is implicit)
    if (line.trim() === '') continue;

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      result.push({
        type: 'heading',
        level: headingMatch[1].length,
        runs: parseInlineFormatting(headingMatch[2]),
      });
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bulletMatch) {
      result.push({
        type: 'bullet',
        runs: parseInlineFormatting(bulletMatch[1]),
      });
      continue;
    }

    // Normal paragraph
    result.push({
      type: 'paragraph',
      runs: parseInlineFormatting(line),
    });
  }

  return result;
}

/**
 * Parse **bold** and *italic* markers into runs.
 */
function parseInlineFormatting(text: string): DocRun[] {
  const runs: DocRun[] = [];
  // Regex: **bold**, *italic*, or plain text
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match[2]) {
      runs.push({ text: match[2], bold: true });
    } else if (match[3]) {
      runs.push({ text: match[3], italic: true });
    } else if (match[4]) {
      runs.push({ text: match[4] });
    }
  }

  if (runs.length === 0) {
    runs.push({ text });
  }

  return runs;
}

// ── Tool ─────────────────────────────────────────────────────────────────────

export class CreateDocumentTool implements ITool {
  public readonly id = 'cli-create-document-v1';
  public readonly name = 'create_document';
  public readonly displayName = 'Create Document';
  public readonly description =
    'Create a Word document (.docx) from text or markdown content. ' +
    'Supports headings, bold, italic, bullet lists, and metadata. ' +
    'Use this instead of file_write when the user asks for a .docx file.';
  public readonly category = 'system';
  public readonly hasSideEffects = true;

  public readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    required: ['path', 'content'],
    properties: {
      path: {
        type: 'string',
        description: 'Output file path (should end in .docx)',
      },
      content: {
        type: 'string',
        description:
          'Document content. Supports a subset of Markdown: # headings, **bold**, *italic*, - bullet lists.',
      },
      title: {
        type: 'string',
        description: 'Document title (metadata)',
      },
      author: {
        type: 'string',
        description: 'Document author (metadata)',
      },
      subject: {
        type: 'string',
        description: 'Document subject (metadata)',
      },
    },
    additionalProperties: false,
  };

  async execute(
    input: {
      path: string;
      content: string;
      title?: string;
      author?: string;
      subject?: string;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ path: string; paragraphs: number; bytes: number }>> {
    try {
      const outPath = resolve(input.path);
      const paragraphs = parseMarkdown(input.content);

      // Dynamic import — docx is a peer/optional dep
      const docx = await import('docx');

      const children: any[] = [];

      for (const para of paragraphs) {
        const textRuns = para.runs.map(
          (r) =>
            new docx.TextRun({
              text: r.text,
              bold: r.bold,
              italics: r.italic,
            }),
        );

        if (para.type === 'heading') {
          const headingLevel: Record<number, (typeof docx.HeadingLevel)[keyof typeof docx.HeadingLevel]> = {
            1: docx.HeadingLevel.HEADING_1,
            2: docx.HeadingLevel.HEADING_2,
            3: docx.HeadingLevel.HEADING_3,
            4: docx.HeadingLevel.HEADING_4,
            5: docx.HeadingLevel.HEADING_5,
            6: docx.HeadingLevel.HEADING_6,
          };
          children.push(
            new docx.Paragraph({
              children: textRuns,
              heading: headingLevel[para.level ?? 1] ?? docx.HeadingLevel.HEADING_1,
            }),
          );
        } else if (para.type === 'bullet') {
          children.push(
            new docx.Paragraph({
              children: textRuns,
              bullet: { level: 0 },
            }),
          );
        } else {
          children.push(
            new docx.Paragraph({
              children: textRuns,
            }),
          );
        }
      }

      // If content had no parseable paragraphs, add as single paragraph
      if (children.length === 0) {
        children.push(
          new docx.Paragraph({
            children: [new docx.TextRun(input.content)],
          }),
        );
      }

      const doc = new docx.Document({
        creator: input.author ?? 'Wunderland AgentOS',
        title: input.title,
        subject: input.subject,
        sections: [{ children }],
      });

      const buffer = await docx.Packer.toBuffer(doc);

      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, buffer);

      return {
        success: true,
        output: {
          path: outPath,
          paragraphs: children.length,
          bytes: buffer.length,
        },
      };
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes("Cannot find module 'docx'")) {
        return {
          success: false,
          error:
            'The "docx" package is required to create Word documents. Install it with: npm install docx',
        };
      }
      return { success: false, error: error.message };
    }
  }

  validateArgs(input: Record<string, any>): { isValid: boolean; errors?: any[] } {
    const errors: string[] = [];
    if (!input.path || typeof input.path !== 'string') errors.push('path is required (string)');
    if (input.content === undefined || input.content === null) errors.push('content is required');
    return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
  }
}
