/**
 * PII Scrubbing Utility
 *
 * Regex-based replacement of sensitive data for safe display in screenshots and demos.
 */

const PII_PATTERNS: Array<[RegExp, string]> = [
  // Home directory paths: /home/username/... → ~/...
  [/\/home\/[^/\s]+\//g, '~/'],

  // Anthropic API keys
  [/sk-ant-[a-zA-Z0-9-]+/g, 'sk-ant-***'],

  // GitHub personal access tokens
  [/ghp_[a-zA-Z0-9]+/g, 'ghp_***'],

  // GitHub OAuth tokens
  [/gho_[a-zA-Z0-9]+/g, 'gho_***'],

  // Generic Bearer tokens
  [/Bearer [a-zA-Z0-9._-]+/g, 'Bearer ***'],

  // Git remote URLs with embedded tokens
  [/https:\/\/[^@\s]+@github\.com/g, 'https://***@github.com'],

  // Email addresses
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***.***'],
];

/**
 * Remove sensitive data from text for safe display.
 * Handles home paths, API keys, tokens, and email addresses.
 */
export function scrubPii(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
