import { describe, it, expect } from 'vitest';
import { KeywordPreFilter } from '../src/KeywordPreFilter.js';

describe('KeywordPreFilter', () => {
  const filter = new KeywordPreFilter();

  it('returns null for clean text', () => {
    const result = filter.scan('Hello, how are you?', {
      profanity: { enabled: true, action: 'sanitize' },
    });
    expect(result).toBeNull();
  });

  it('detects profanity keyword', () => {
    const result = filter.scan('What the fuck is this?', {
      profanity: { enabled: true, action: 'block' },
    });
    expect(result).not.toBeNull();
    expect(result!.category).toBe('profanity');
  });

  it('skips disabled categories', () => {
    const result = filter.scan('What the fuck is this?', {
      profanity: { enabled: false, action: 'block' },
    });
    expect(result).toBeNull();
  });

  it('uses custom keyword list when provided', () => {
    const customFilter = new KeywordPreFilter({
      profanity: ['dingus', 'bozo'],
    });
    const result = customFilter.scan('You absolute bozo', {
      profanity: { enabled: true, action: 'sanitize' },
    });
    expect(result).not.toBeNull();
    expect(result!.category).toBe('profanity');
  });

  it('is case-insensitive', () => {
    const result = filter.scan('What the FUCK', {
      profanity: { enabled: true, action: 'block' },
    });
    expect(result).not.toBeNull();
  });
});
