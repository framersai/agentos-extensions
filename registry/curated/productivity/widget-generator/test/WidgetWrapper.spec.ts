import { describe, it, expect } from 'vitest';
import { WidgetWrapper } from '../src/WidgetWrapper.js';

describe('WidgetWrapper', () => {
  const wrapper = new WidgetWrapper();

  it('adds DOCTYPE when missing', () => {
    const result = wrapper.wrap('<div>Hello</div>');
    expect(result).toContain('<!DOCTYPE html>');
  });

  it('adds meta charset when missing', () => {
    const result = wrapper.wrap('<div>Hello</div>');
    expect(result).toContain('<meta charset="utf-8">');
  });

  it('adds viewport meta when missing', () => {
    const result = wrapper.wrap('<div>Hello</div>');
    expect(result).toContain('name="viewport"');
    expect(result).toContain('width=device-width');
  });

  it('adds CSS reset', () => {
    const result = wrapper.wrap('<div>Hello</div>');
    expect(result).toContain('box-sizing: border-box');
    expect(result).toContain('system-ui');
  });

  it('adds error boundary script containing window.onerror', () => {
    const result = wrapper.wrap('<div>Hello</div>');
    expect(result).toContain('window.onerror');
  });

  it('does NOT double-add DOCTYPE if already present', () => {
    const html = '<!DOCTYPE html><html><body><p>Hi</p></body></html>';
    const result = wrapper.wrap(html);
    const count = (result.match(/<!DOCTYPE html>/gi) || []).length;
    expect(count).toBe(1);
  });

  it('does NOT double-add meta charset if already present', () => {
    const html = '<html><head><meta charset="utf-8"></head><body>Hi</body></html>';
    const result = wrapper.wrap(html);
    const count = (result.match(/charset/gi) || []).length;
    expect(count).toBe(1);
  });

  it('does NOT double-add viewport if already present', () => {
    const html =
      '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>Hi</body></html>';
    const result = wrapper.wrap(html);
    const count = (result.match(/viewport/gi) || []).length;
    expect(count).toBe(1);
  });

  it('handles minimal HTML input', () => {
    const result = wrapper.wrap('<div>Hello</div>');
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<meta charset="utf-8">');
    expect(result).toContain('viewport');
    expect(result).toContain('window.onerror');
    expect(result).toContain('<div>Hello</div>');
  });

  it('output is always a string', () => {
    const result = wrapper.wrap('<div>Hello</div>');
    expect(typeof result).toBe('string');
  });
});
