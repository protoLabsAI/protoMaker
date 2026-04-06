/**
 * Input sanitizer for GitHub issue bodies
 *
 * Sanitizes issue body text before it is published to the topic bus.
 * The sanitized string — not the original — is forwarded to agents.
 */

import { createLogger } from '@protolabsai/utils';

const logger = createLogger('sanitizer');

/**
 * Configuration for issue body sanitization.
 * Matches the sanitization block in github.yaml.
 */
export interface SanitizationConfig {
  /** Regex pattern strings matched case-insensitively. Matching lines are stripped. */
  injectionPatterns: string[];
  /** Maximum total body length in characters. Body is truncated at this limit. */
  maxBodyChars: number;
  /** Maximum length of any single line. Lines exceeding this are truncated. */
  maxLineLengthChars: number;
}

/**
 * Result of sanitizing a GitHub issue body.
 */
export interface SanitizeResult {
  /** The sanitized body text, safe for publication to the topic bus. */
  sanitized: string;
  /** Human-readable labels for each pattern category that matched. */
  patternsFound: string[];
  /** True if the body was truncated to maxBodyChars. */
  truncated: boolean;
  /** Character length of the original body before any sanitization. */
  originalLength: number;
}

/** Regex matching raw HTML tags (open, close, and self-closing). */
const HTML_TAG_RE = /<[^>]+>/g;

/** Regex matching base64-like blobs of 100+ characters. */
const BASE64_BLOB_RE = /[A-Za-z0-9+/=]{100,}/g;

/**
 * Sanitize a GitHub issue body according to the rules in the sanitization config.
 *
 * Processing order:
 *   1. Strip lines matching any injectionPattern (case-insensitive)
 *   2. Truncate each line to maxLineLengthChars
 *   3. Strip raw HTML tags
 *   4. Strip base64 blobs (>= 100 chars)
 *   5. Truncate total body to maxBodyChars
 *   6. Prepend warning prefix if any patterns were found
 */
export function sanitizeIssueBody(body: string, config: SanitizationConfig): SanitizeResult {
  const { injectionPatterns, maxBodyChars, maxLineLengthChars } = config;
  const originalLength = body.length;
  const patternsFound: string[] = [];

  // Compile injection patterns once, case-insensitive
  const compiledPatterns = injectionPatterns.map((p) => ({
    label: p,
    re: new RegExp(p, 'i'),
  }));

  // Step 1: Process line by line — strip injection-matching lines, truncate long lines
  const lines = body.split('\n');
  const processedLines: string[] = [];

  for (const line of lines) {
    // Check injection patterns
    let lineStripped = false;
    for (const { label, re } of compiledPatterns) {
      if (re.test(line)) {
        if (!patternsFound.includes(label)) {
          patternsFound.push(label);
        }
        lineStripped = true;
        break;
      }
    }

    if (lineStripped) {
      // Strip the line (replace with empty string, preserving line structure)
      processedLines.push('');
      continue;
    }

    // Step 2: Truncate line exceeding maxLineLengthChars
    const truncatedLine =
      line.length > maxLineLengthChars ? line.slice(0, maxLineLengthChars) : line;
    processedLines.push(truncatedLine);
  }

  let sanitized = processedLines.join('\n');

  // Step 3: Strip raw HTML tags
  const beforeHtml = sanitized;
  sanitized = sanitized.replace(HTML_TAG_RE, '');
  if (sanitized !== beforeHtml && !patternsFound.includes('html_tags')) {
    patternsFound.push('html_tags');
  }

  // Step 4: Strip base64 blobs
  const beforeBase64 = sanitized;
  sanitized = sanitized.replace(BASE64_BLOB_RE, '');
  if (sanitized !== beforeBase64 && !patternsFound.includes('base64_blob')) {
    patternsFound.push('base64_blob');
  }

  // Step 5: Truncate total body to maxBodyChars
  const truncated = sanitized.length > maxBodyChars;
  if (truncated) {
    sanitized = sanitized.slice(0, maxBodyChars);
  }

  // Step 6: Prepend warning prefix if patterns were found
  if (patternsFound.length > 0) {
    sanitized = `[SANITIZED: ${patternsFound.length} suspicious pattern(s) removed]\n${sanitized}`;
  }

  // Log at warn level so operators can audit
  if (patternsFound.length > 0) {
    logger.warn('sanitizeIssueBody: patterns stripped', {
      originalLength,
      patternsFound,
      truncated,
    });
  }

  return { sanitized, patternsFound, truncated, originalLength };
}
