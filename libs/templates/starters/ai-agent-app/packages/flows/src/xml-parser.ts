/**
 * XML Tag Extraction Utilities
 *
 * Provides functions to extract structured data from XML-formatted LLM outputs.
 * More robust than JSON parsing since LLMs naturally produce XML-like structures
 * and frequently wrap JSON in ```json code fences that break JSON.parse().
 *
 * Pattern: Prompt model to output semantic XML tags → extract with regex → validate
 *
 * Zero-dependency utility — no external imports required.
 */

/**
 * Unescape HTML entities in a string.
 * Converts &lt; &gt; &amp; &quot; &#39; back to literal characters.
 */
function unescapeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Extract content from a single XML tag.
 * Returns undefined if tag not found or empty.
 * Automatically unescapes HTML entities in the extracted content.
 */
export function extractTag(output: string, tag: string): string | undefined {
  if (!/^[a-zA-Z0-9_-]+$/.test(tag)) {
    throw new Error(
      `Invalid tag name: ${tag}. Must contain only alphanumerics, hyphens, and underscores`
    );
  }

  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const match = output.match(regex);

  if (!match) return undefined;
  const content = match[1].trim();
  return content.length > 0 ? unescapeHtmlEntities(content) : undefined;
}

/**
 * Extract content from a tag, throwing if not found.
 */
export function extractRequiredTag(output: string, tag: string): string {
  const content = extractTag(output, tag);
  if (content === undefined) {
    throw new Error(`Required tag <${tag}> not found or empty in output`);
  }
  return content;
}

/**
 * Extract content from a tag, returning a default value if not found.
 */
export function extractOptionalTag(output: string, tag: string, defaultValue: string): string {
  return extractTag(output, tag) ?? defaultValue;
}

/**
 * Extract all occurrences of a repeated tag.
 * Useful for parsing arrays of items.
 * Automatically unescapes HTML entities in the extracted content.
 *
 * Example: `<item>a</item><item>b</item>` → `['a', 'b']`
 */
export function extractAllTags(output: string, tag: string): string[] {
  if (!/^[a-zA-Z0-9_-]+$/.test(tag)) {
    throw new Error(
      `Invalid tag name: ${tag}. Must contain only alphanumerics, hyphens, and underscores`
    );
  }

  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi');
  const matches: string[] = [];
  let match;

  while ((match = regex.exec(output)) !== null) {
    const content = match[1].trim();
    if (content.length > 0) {
      matches.push(unescapeHtmlEntities(content));
    }
  }

  return matches;
}

/**
 * Extract JSON content from within an XML tag.
 * Useful when a specific field contains structured JSON inside XML wrapper.
 */
export function extractTaggedJSON<T>(output: string, tag: string): T {
  const content = extractRequiredTag(output, tag);
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON from <${tag}> tag: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract an integer from a tag.
 */
export function extractRequiredInt(output: string, tag: string): number {
  const content = extractRequiredTag(output, tag);
  const parsed = parseInt(content, 10);
  if (isNaN(parsed)) {
    throw new Error(`Tag <${tag}> does not contain a valid integer: ${content}`);
  }
  return parsed;
}

/**
 * Extract an integer clamped to a min/max range.
 */
export function extractClampedInt(output: string, tag: string, min: number, max: number): number {
  const value = extractRequiredInt(output, tag);
  return Math.max(min, Math.min(max, value));
}

/**
 * Extract an optional integer from a tag.
 */
export function extractOptionalInt(output: string, tag: string): number | undefined {
  const content = extractTag(output, tag);
  if (content === undefined) return undefined;
  const parsed = parseInt(content, 10);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Extract a boolean from a tag.
 * Recognizes: yes/no, true/false, 1/0
 */
export function extractBoolean(output: string, tag: string, defaultValue: boolean): boolean {
  const content = extractTag(output, tag);
  if (content === undefined) return defaultValue;
  const lower = content.toLowerCase();
  return lower === 'yes' || lower === 'true' || lower === '1';
}

/**
 * Check if a string appears to be XML (has at least one tag).
 */
export function isXML(content: string): boolean {
  return /<[a-zA-Z][a-zA-Z0-9_-]*>[\s\S]*?<\/[a-zA-Z][a-zA-Z0-9_-]*>/i.test(content);
}

/**
 * Extract a validated enum value from a tag (case-insensitive).
 * Returns the canonical casing from validValues.
 */
export function extractRequiredEnum<T extends string>(
  output: string,
  tag: string,
  validValues: readonly T[]
): T {
  const content = extractRequiredTag(output, tag);
  const contentLower = content.toLowerCase();
  const matchIndex = validValues.findIndex((v) => v.toLowerCase() === contentLower);

  if (matchIndex === -1) {
    throw new Error(
      `Tag <${tag}> has invalid value "${content}". Must be one of: ${validValues.join(', ')}`
    );
  }

  return validValues[matchIndex];
}

/**
 * Extract an optional enum value from a tag (case-insensitive).
 */
export function extractOptionalEnum<T extends string>(
  output: string,
  tag: string,
  validValues: readonly T[]
): T | undefined {
  const content = extractTag(output, tag);
  if (content === undefined) return undefined;

  const contentLower = content.toLowerCase();
  const matchIndex = validValues.findIndex((v) => v.toLowerCase() === contentLower);
  return matchIndex === -1 ? undefined : validValues[matchIndex];
}
