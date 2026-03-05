import { describe, it, expect } from 'vitest';
import { sanitizeStreamingMarkdown } from '../streaming-markdown';

describe('sanitizeStreamingMarkdown', () => {
  it('closes unclosed fenced code block', () => {
    const input = 'Some text\n```typescript\nconst x = 1;';
    const result = sanitizeStreamingMarkdown(input);
    expect(result).toBe(input + '\n```');
  });

  it('closes unclosed inline code', () => {
    const input = 'Use `foo to do something';
    const result = sanitizeStreamingMarkdown(input);
    expect(result).toBe(input + '`');
  });

  it('closes unclosed bold', () => {
    const input = 'This is **bold text';
    const result = sanitizeStreamingMarkdown(input);
    expect(result).toBe(input + '**');
  });

  it('returns clean input unchanged', () => {
    const input = 'This is **bold** and `inline` and\n```\ncode\n```';
    const result = sanitizeStreamingMarkdown(input);
    expect(result).toBe(input);
  });
});
