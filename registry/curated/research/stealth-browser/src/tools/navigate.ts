/**
 * Stealth Navigate Tool
 * Navigate stealth browser to a URL with anti-detection, bypassing bot protection.
 *
 * @module @framers/agentos-ext-stealth-browser
 */

import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { StealthBrowserService } from '../StealthBrowserService.js';
import type { NavigationResult } from '../types.js';

/**
 * Tool for stealth navigation to URLs on bot-protected sites
 */
export class StealthNavigateTool implements ITool {
  public readonly id = 'stealth-browser-navigate-v1';
  /** Tool call name used by the LLM / ToolExecutor. */
  public readonly name = 'stealth_navigate';
  public readonly displayName = 'Stealth Navigate';
  public readonly description =
    'Navigate stealth browser to a URL with anti-bot-detection enabled. ' +
    'Use this instead of browser_navigate for sites that block headless browsers ' +
    '(Amazon, eBay, LinkedIn, Cloudflare-protected sites, etc.). ' +
    'Returns full page text, links, and optionally raw HTML.';
  public readonly category = 'research';
  public readonly hasSideEffects = false;

  public readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        description: 'The URL to navigate to',
      },
      waitFor: {
        type: 'string',
        enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'],
        default: 'networkidle2',
        description: 'When to consider navigation complete',
      },
      returnHtml: {
        type: 'boolean',
        default: false,
        description: 'Include full HTML in response',
      },
      returnText: {
        type: 'boolean',
        default: true,
        description: 'Include extracted text in response',
      },
      returnLinks: {
        type: 'boolean',
        default: true,
        description: 'Include all links found on the page (text + href)',
      },
      maxTextLength: {
        type: 'number',
        default: 50000,
        description: 'Maximum characters of page text to return (default 50000)',
      },
    },
    additionalProperties: false,
  };

  constructor(private browserService: StealthBrowserService) {}

  /**
   * Execute stealth navigation
   */
  async execute(
    input: {
      url: string;
      waitFor?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
      returnHtml?: boolean;
      returnText?: boolean;
      returnLinks?: boolean;
      maxTextLength?: number;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<NavigationResult>> {
    try {
      const result = await this.browserService.navigate(input.url, {
        waitFor: input.waitFor,
      });

      const maxLen =
        typeof input.maxTextLength === 'number' && input.maxTextLength > 0
          ? input.maxTextLength
          : 50000;

      const output: NavigationResult = {
        url: result.url,
        status: result.status,
        title: result.title,
        loadTime: result.loadTime,
        consoleMessages: result.consoleMessages,
      };

      if (input.returnHtml) {
        output.html = result.html;
      }
      if (input.returnText !== false) {
        const fullLen = result.text?.length || 0;
        if (fullLen > maxLen) {
          output.text = result.text!.slice(0, maxLen);
          (output as any).textTruncated = true;
          (output as any).fullTextLength = fullLen;
          (output as any).truncationNote =
            `Page text was ${fullLen.toLocaleString()} characters, truncated to ${maxLen.toLocaleString()}. ` +
            `To get content from specific sections, use stealth_scrape with a CSS selector (e.g. 'footer', 'main', '#content'). ` +
            `Or increase maxTextLength parameter.`;
        } else {
          output.text = result.text;
        }
      }

      // Extract and return all links from the page (default: on)
      if (input.returnLinks !== false) {
        try {
          const links = await this.browserService.evaluate<
            Array<{ text: string; href: string }>
          >(() =>
            Array.from(document.querySelectorAll('a[href]'))
              .map((a) => ({
                text: (a.textContent || '').trim().slice(0, 200),
                href: (a as HTMLAnchorElement).href,
              }))
              .filter((l) => l.href && l.text),
          );
          (output as any).links = links;
        } catch {
          // Non-fatal — page may have restrictive CSP
        }
      }

      return { success: true, output };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate input
   */
  validateArgs(input: Record<string, any>): { isValid: boolean; errors?: any[] } {
    const errors: string[] = [];

    if (!input.url) {
      errors.push('URL is required');
    } else if (typeof input.url !== 'string') {
      errors.push('URL must be a string');
    } else {
      try {
        new URL(input.url);
      } catch {
        errors.push('Invalid URL format');
      }
    }

    return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
  }
}
