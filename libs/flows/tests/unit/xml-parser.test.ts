import { describe, it, expect } from 'vitest';
import {
  extractTag,
  extractRequiredTag,
  extractOptionalTag,
  extractAllTags,
} from '../../src/content/xml-parser';

describe('xml-parser HTML entity unescaping', () => {
  it('should unescape HTML entities in extracted content', () => {
    const output = '<code>&lt;div&gt;Hello&lt;/div&gt;</code>';
    const result = extractTag(output, 'code');
    expect(result).toBe('<div>Hello</div>');
  });

  it('should handle TypeScript generics with angle brackets', () => {
    const output = '<type>Annotation&lt;string[]&gt;</type>';
    const result = extractTag(output, 'type');
    expect(result).toBe('Annotation<string[]>');
  });

  it('should unescape ampersands', () => {
    const output = '<text>Tom &amp; Jerry</text>';
    const result = extractTag(output, 'text');
    expect(result).toBe('Tom & Jerry');
  });

  it('should unescape quotes', () => {
    const output = '<attr>data-value=&quot;test&quot;</attr>';
    const result = extractTag(output, 'attr');
    expect(result).toBe('data-value="test"');
  });

  it('should unescape apostrophes', () => {
    const output = '<text>It&#39;s working</text>';
    const result = extractTag(output, 'text');
    expect(result).toBe("It's working");
  });

  it('should handle multiple entities in one string', () => {
    const output = '<code>if (x &lt; 5 &amp;&amp; y &gt; 3) { return &quot;ok&quot;; }</code>';
    const result = extractTag(output, 'code');
    expect(result).toBe('if (x < 5 && y > 3) { return "ok"; }');
  });

  it('should unescape entities in extractRequiredTag', () => {
    const output = '<required>&lt;required&gt;</required>';
    const result = extractRequiredTag(output, 'required');
    expect(result).toBe('<required>');
  });

  it('should unescape entities in extractOptionalTag', () => {
    const output = '<optional>&lt;optional&gt;</optional>';
    const result = extractOptionalTag(output, 'optional', 'default');
    expect(result).toBe('<optional>');
  });

  it('should unescape entities in extractAllTags', () => {
    const output = '<item>&lt;a&gt;</item><item>&lt;b&gt;</item><item>&lt;c&gt;</item>';
    const result = extractAllTags(output, 'item');
    expect(result).toEqual(['<a>', '<b>', '<c>']);
  });

  it('should not affect normal text without entities', () => {
    const output = '<text>Hello World</text>';
    const result = extractTag(output, 'text');
    expect(result).toBe('Hello World');
  });

  it('should handle code blocks with complex TypeScript', () => {
    const output = `<code>
function process&lt;T extends string[]&gt;(items: T): void {
  const map: Map&lt;string, number&gt; = new Map();
  if (items.length &gt; 0 &amp;&amp; items[0] !== &quot;&quot;) {
    console.log(&quot;Processing&quot;);
  }
}
</code>`;
    const result = extractTag(output, 'code');
    expect(result).toContain('function process<T extends string[]>(items: T): void');
    expect(result).toContain('const map: Map<string, number> = new Map();');
    expect(result).toContain('if (items.length > 0 && items[0] !== "")');
  });
});
