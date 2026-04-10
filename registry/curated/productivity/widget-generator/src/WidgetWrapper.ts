// @ts-nocheck
/**
 * @module WidgetWrapper
 *
 * Safety wrapper that ensures every generated widget has a well-formed
 * HTML structure, sensible defaults, and a client-side error boundary.
 *
 * The wrapper is additive: it inspects the incoming HTML with
 * case-insensitive matching and only injects elements that are missing.
 * This prevents double-adding when the agent already includes a
 * doctype, charset meta, viewport meta, or error handler.
 */

/**
 * Wraps raw HTML content with structural defaults and an error boundary.
 *
 * Guarantees that every widget has:
 * - A `<!DOCTYPE html>` declaration
 * - A `<meta charset="utf-8">` tag
 * - A responsive viewport meta tag
 * - A minimal CSS reset (margin/padding/box-sizing + system-ui font)
 * - A `window.onerror` error boundary that surfaces runtime errors visually
 *
 * @example
 * ```ts
 * const wrapper = new WidgetWrapper();
 * const safe = wrapper.wrap('<div>Hello world</div>');
 * // safe now contains a full HTML document with all defaults injected
 * ```
 */
export class WidgetWrapper {
  /**
   * Apply the safety wrapper to the given HTML string.
   *
   * Performs case-insensitive checks against the source HTML and only
   * injects elements that are not already present. The injection order
   * is: doctype, charset, viewport, CSS reset, error boundary.
   *
   * @param html - Raw HTML content to wrap.
   * @returns The wrapped HTML with all missing defaults injected.
   */
  wrap(html: string): string {
    const lower = html.toLowerCase();
    let result = html;

    // 1. Add <!DOCTYPE html> if missing
    if (!lower.includes('<!doctype html>')) {
      result = '<!DOCTYPE html>\n' + result;
    }

    // 2. Add <meta charset="utf-8"> if missing
    if (!lower.includes('charset')) {
      result = this.injectIntoHead(result, '<meta charset="utf-8">');
    }

    // 3. Add viewport meta if missing
    if (!lower.includes('viewport')) {
      result = this.injectIntoHead(
        result,
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
      );
    }

    // 4. Prepend CSS reset
    if (!lower.includes('box-sizing: border-box')) {
      const resetCss =
        '<style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: system-ui, sans-serif; }</style>';
      result = this.injectIntoHead(result, resetCss);
    }

    // 5. Append error boundary script
    if (!lower.includes('window.onerror')) {
      const errorScript = `<script>
window.onerror = function(msg, url, line) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:16px;background:#fee2e2;color:#991b1b;font:14px system-ui;z-index:99999';
  el.textContent = 'Widget error: ' + msg + ' (line ' + line + ')';
  document.body.prepend(el);
};
</script>`;
      result = this.injectBeforeBodyClose(result, errorScript);
    }

    return result;
  }

  /**
   * Inject content into the `<head>` section of the HTML document.
   *
   * If a `<head>` tag exists, the content is inserted right after it.
   * Otherwise, it is prepended to the document (after the doctype, if
   * present).
   *
   * @param html    - The HTML document string.
   * @param content - The HTML fragment to inject.
   * @returns The modified HTML with the content injected.
   */
  private injectIntoHead(html: string, content: string): string {
    const headIndex = html.toLowerCase().indexOf('<head>');

    if (headIndex !== -1) {
      const insertPos = headIndex + '<head>'.length;
      return html.slice(0, insertPos) + '\n' + content + html.slice(insertPos);
    }

    // No <head> tag — insert after doctype if present, otherwise at the top
    const doctypeEnd = html.toLowerCase().indexOf('<!doctype html>');
    if (doctypeEnd !== -1) {
      const insertPos = doctypeEnd + '<!doctype html>'.length;
      return html.slice(0, insertPos) + '\n' + content + html.slice(insertPos);
    }

    return content + '\n' + html;
  }

  /**
   * Inject content just before the closing `</body>` tag.
   *
   * If no `</body>` tag exists, the content is appended at the end
   * of the document.
   *
   * @param html    - The HTML document string.
   * @param content - The HTML fragment to inject.
   * @returns The modified HTML with the content injected.
   */
  private injectBeforeBodyClose(html: string, content: string): string {
    const bodyCloseIndex = html.toLowerCase().indexOf('</body>');

    if (bodyCloseIndex !== -1) {
      return html.slice(0, bodyCloseIndex) + content + '\n' + html.slice(bodyCloseIndex);
    }

    return html + '\n' + content;
  }
}
