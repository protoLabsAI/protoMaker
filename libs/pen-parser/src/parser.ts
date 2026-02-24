import type { PenDocument } from './types.js';

/**
 * Parse a PEN file from JSON string
 * @param json - JSON string content of the .pen file
 * @returns Parsed PenDocument
 * @throws Error if JSON is invalid or document structure is invalid
 */
export function parsePenFile(json: string): PenDocument {
  try {
    const parsed = JSON.parse(json);

    // Validate basic structure
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
 * Parse a PEN file from file path
 * @param filePath - Path to the .pen file
 * @returns Parsed PenDocument
 */
export async function parsePenFileFromPath(filePath: string): Promise<PenDocument> {
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return parsePenFile(content);
}
