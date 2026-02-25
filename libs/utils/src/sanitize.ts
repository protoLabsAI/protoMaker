/**
 * @protolabs-ai/utils
 * Sanitization and security utilities
 */

/**
 * Severity level for sanitization violations
 */
export type SanitizationSeverity = 'warn' | 'block';

/**
 * A security or safety violation detected during sanitization
 */
export interface SanitizationViolation {
  type: string;
  message: string;
  severity: SanitizationSeverity;
  position?: { start: number; end: number };
}

/**
 * Result of a sanitization operation
 */
export interface SanitizationResult {
  text: string;
  violations: SanitizationViolation[];
}

/**
 * Homoglyph replacement map for common Cyrillic lookalikes
 */
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic to Latin
  а: 'a', // Cyrillic а
  е: 'e', // Cyrillic е
  о: 'o', // Cyrillic о
  р: 'p', // Cyrillic р
  с: 'c', // Cyrillic с
  у: 'y', // Cyrillic у
  х: 'x', // Cyrillic х
  А: 'A', // Cyrillic А
  В: 'B', // Cyrillic В
  Е: 'E', // Cyrillic Е
  К: 'K', // Cyrillic К
  М: 'M', // Cyrillic М
  Н: 'H', // Cyrillic Н
  О: 'O', // Cyrillic О
  Р: 'P', // Cyrillic Р
  С: 'C', // Cyrillic С
  Т: 'T', // Cyrillic Т
  Х: 'X', // Cyrillic Х
};

/**
 * Normalize Unicode text by:
 * - Normalizing to NFC form
 * - Stripping zero-width characters
 * - Stripping directional overrides
 * - Replacing homoglyph lookalikes in ASCII range
 */
export function normalizeUnicode(text: string): string {
  // Step 1: Normalize to NFC form
  let normalized = text.normalize('NFC');

  // Step 2: Strip zero-width characters
  // U+200B: Zero Width Space
  // U+200C: Zero Width Non-Joiner
  // U+200D: Zero Width Joiner
  // U+FEFF: Zero Width No-Break Space (BOM)
  // U+2060: Word Joiner
  normalized = normalized.replace(/[\u200B\u200C\u200D\uFEFF\u2060]/g, '');

  // Step 3: Strip directional overrides
  // U+202A-U+202E: Left-to-Right Embedding, Right-to-Left Embedding, etc.
  // U+2066-U+2069: Left-to-Right Isolate, Right-to-Left Isolate, etc.
  normalized = normalized.replace(/[\u202A-\u202E\u2066-\u2069]/g, '');

  // Step 4: Replace homoglyph lookalikes
  normalized = normalized.replace(/[аеорсуxхАВЕКМНОРСТХ]/g, (char) => HOMOGLYPH_MAP[char] || char);

  return normalized;
}

/**
 * Sanitize markdown text for LLM consumption by:
 * - Removing HTML comments
 * - Removing dangerous HTML tags
 * - Detecting suspiciously long lines that could be encoded payloads
 */
export function sanitizeMarkdownForLLM(text: string): SanitizationResult {
  const violations: SanitizationViolation[] = [];
  let sanitized = text;

  // Remove HTML comments
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');

  // Remove dangerous HTML tags
  // <script>
  sanitized = sanitized.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  // <iframe>
  sanitized = sanitized.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');

  // <img>
  sanitized = sanitized.replace(/<img\b[^>]*>/gi, '');

  // <a> with javascript: hrefs
  sanitized = sanitized.replace(/<a\b[^>]*\bhref\s*=\s*["']?javascript:[^>]*>[\s\S]*?<\/a>/gi, '');

  // Detect suspiciously long lines (>2000 chars)
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (line.length > 2000) {
      violations.push({
        type: 'long_line',
        message: `Line ${index + 1} is suspiciously long (${line.length} chars), may contain encoded payload`,
        severity: 'warn',
        position: {
          start: text.split('\n').slice(0, index).join('\n').length,
          end: text
            .split('\n')
            .slice(0, index + 1)
            .join('\n').length,
        },
      });
    }
  });

  return {
    text: sanitized,
    violations,
  };
}

/**
 * Prompt injection detection patterns
 */
const INJECTION_PATTERNS: Array<{
  pattern: RegExp;
  type: string;
  severity: SanitizationSeverity;
}> = [
  // "ignore previous instructions" variants
  {
    pattern: /ignore\s+(previous|all|above)\s+instructions?/i,
    type: 'ignore_instructions',
    severity: 'block',
  },
  // "you are now" / "act as" / "pretend you are"
  {
    pattern: /(you\s+are\s+now|act\s+as|pretend\s+(you\s+are|to\s+be))/i,
    type: 'role_manipulation',
    severity: 'block',
  },
  // System markers
  {
    pattern: /(\[SYSTEM\]|<system>|###\s*INSTRUCTION)/i,
    type: 'system_marker',
    severity: 'block',
  },
  // Jailbreak attempts
  {
    pattern: /(jailbreak|DAN\b)/i,
    type: 'jailbreak',
    severity: 'block',
  },
];

/**
 * Detect prompt injection attempts in text
 */
export function detectPromptInjection(text: string): SanitizationViolation[] {
  const violations: SanitizationViolation[] = [];

  // Check against pattern library
  for (const { pattern, type, severity } of INJECTION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      violations.push({
        type,
        message: `Potential prompt injection detected: "${match[0]}"`,
        severity,
        position: {
          start: match.index,
          end: match.index + match[0].length,
        },
      });
    }
  }

  // Check for repeated instruction-like patterns
  const instructionWords = ['must', 'always', 'never'];
  for (const word of instructionWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches && matches.length > 3) {
      violations.push({
        type: 'repeated_instructions',
        message: `Repeated instruction word "${word}" found ${matches.length} times (suspicious pattern)`,
        severity: 'warn',
      });
    }
  }

  return violations;
}

/**
 * Validate file paths in text to prevent path traversal and unauthorized access
 */
export function validateFilePaths(text: string, projectRoot: string): SanitizationViolation[] {
  const violations: SanitizationViolation[] = [];

  // Normalize project root for comparison
  const normalizedRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');

  // Pattern to match file paths (Unix and Windows style)
  // Matches: /absolute/path, ./relative/path, ../parent/path, C:\Windows\path
  const pathPattern =
    /(?:^|\s)([\/\\][\w\/\\.\\-]+|\.{1,2}[\/\\][\w\/\\.\\-]+|[a-zA-Z]:[\/\\][\w\/\\.\\-]+)/g;

  let match;
  while ((match = pathPattern.exec(text)) !== null) {
    const path = match[1];
    const normalizedPath = path.replace(/\\/g, '/');

    // Check for path traversal attempts
    if (normalizedPath.includes('../') || normalizedPath.includes('/..')) {
      violations.push({
        type: 'path_traversal',
        message: `Path traversal attempt detected: "${path}"`,
        severity: 'block',
        position: {
          start: match.index,
          end: match.index + match[0].length,
        },
      });
      continue;
    }

    // Check if absolute path is outside project root
    if (normalizedPath.startsWith('/') || /^[a-zA-Z]:/.test(normalizedPath)) {
      // It's an absolute path
      if (!normalizedPath.startsWith(normalizedRoot)) {
        violations.push({
          type: 'unauthorized_path',
          message: `Absolute path outside project root: "${path}"`,
          severity: 'block',
          position: {
            start: match.index,
            end: match.index + match[0].length,
          },
        });
      }
    }
  }

  return violations;
}
