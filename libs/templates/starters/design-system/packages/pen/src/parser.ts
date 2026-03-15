/**
 * .pen file parser
 *
 * Parses JSON string or file content into a typed PenDocument.
 * Zero external dependencies.
 */

import type { PenDocument } from './types.js';

/**
 * Parse a .pen file from a JSON string.
 *
 * @param json - Raw JSON string content of the .pen file
 * @returns Parsed PenDocument
 * @throws Error if JSON is invalid or required fields are missing
 *
 * @example
 * ```ts
 * import { parsePenFile } from '@@PROJECT_NAME-pen';
 * const doc = parsePenFile(fs.readFileSync('designs/my.pen', 'utf-8'));
 * ```
 */
export function parsePenFile(json: string): PenDocument {
  try {
    const parsed = JSON.parse(json);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid PEN file: not an object');
    }

    if (!parsed.version || typeof parsed.version !== 'string') {
      throw new Error('Invalid PEN file: missing or invalid version');
    }

    if (!Array.isArray(parsed.children)) {
      throw new Error('Invalid PEN file: children must be an array');
    }

    return parsed as PenDocument;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in PEN file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parse a .pen file from a file path (Node.js / server-side only).
 *
 * @param filePath - Absolute or relative path to the .pen file
 * @returns Parsed PenDocument
 *
 * @example
 * ```ts
 * const doc = await parsePenFileFromPath('./designs/shadcn-kit.pen');
 * ```
 */
export async function parsePenFileFromPath(filePath: string): Promise<PenDocument> {
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return parsePenFile(content);
}
