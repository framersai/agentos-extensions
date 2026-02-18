import type { BrowserService } from '../BrowserService.js';

export class PageSnapshotTool {
  readonly id = 'browserSnapshot';
  readonly name = 'browserSnapshot';
  readonly displayName = 'Page Snapshot';
  readonly description = 'Get a structured inventory of the current page — all interactive elements, forms, links, and metadata. Essential for agent-driven navigation.';
  readonly category = 'browser';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {},
  };

  constructor(private browser: BrowserService) {}

  async execute(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const snapshot = await this.browser.snapshot();
      return { success: true, data: snapshot };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
