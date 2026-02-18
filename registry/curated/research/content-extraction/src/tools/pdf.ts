import type { ContentExtractionService } from '../ContentExtractionService.js';

export class ExtractPdfTool {
  readonly id = 'extractPdf';
  readonly name = 'extractPdf';
  readonly displayName = 'Extract PDF Content';
  readonly description = 'Extract text content from a PDF document at a given URL.';
  readonly category = 'research';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'URL of the PDF document to extract text from' },
    },
    required: ['url'],
  };

  constructor(private service: ContentExtractionService) {}

  async execute(args: {
    url: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.extractPdf(args.url);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
