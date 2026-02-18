import type { BrowserService } from '../BrowserService.js';

export class SessionTool {
  readonly id = 'browserSession';
  readonly name = 'browserSession';
  readonly displayName = 'Manage Session';
  readonly description = 'Save or restore browser login sessions (cookies + localStorage). Use "save" to persist the current session, "restore" to load a previously saved session.';
  readonly category = 'browser';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['save', 'restore'],
        description: 'Whether to save the current session or restore a previous one',
      },
      sessionData: {
        type: 'object',
        description: 'Session state to restore (required for "restore" action)',
      },
    },
    required: ['action'],
  };

  constructor(private browser: BrowserService) {}

  async execute(args: { action: 'save' | 'restore'; sessionData?: any }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (args.action === 'save') {
        const state = await this.browser.saveSession();
        return { success: true, data: state };
      } else {
        if (!args.sessionData) {
          return { success: false, error: 'sessionData is required for restore action' };
        }
        await this.browser.restoreSession(args.sessionData);
        return { success: true };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
