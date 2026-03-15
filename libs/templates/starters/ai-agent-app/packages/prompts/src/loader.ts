/**
 * PromptLoader — reads prompt files from a directory and registers them.
 *
 * Prompt files are plain markdown with YAML frontmatter:
 *
 * ```markdown
 * ---
 * name: General Assistant
 * role: assistant
 * version: 1.0.0
 * description: Helpful assistant for general queries.
 * variables:
 *   - date
 *   - userName
 * ---
 *
 * You are a helpful assistant. Today is {{date}}.
 * ```
 *
 * @example
 * ```typescript
 * import path from 'node:path';
 * import { PromptLoader } from './loader.js';
 * import { PromptRegistry } from './registry.js';
 *
 * const registry = new PromptRegistry();
 * const loader = new PromptLoader(registry);
 *
 * await loader.loadDirectory(path.join(process.cwd(), 'prompts'));
 * // All .md files in prompts/ are now registered in the registry.
 * ```
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';

import type { ParsedPrompt, PromptFrontmatter } from './types.js';
import type { PromptRegistry } from './registry.js';

// ---------------------------------------------------------------------------
// Frontmatter parser (zero external deps)
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a YAML-frontmatter markdown file.
 *
 * Uses a minimal inline parser to avoid adding a yaml/gray-matter dependency.
 * Supports string, number, and string-array values only — sufficient for prompt
 * frontmatter.
 */
export function parsePromptFile(source: string, filePath: string): ParsedPrompt | null {
  const match = FRONTMATTER_RE.exec(source.trim());
  if (!match) return null;

  const [, yamlBlock, body] = match;
  const frontmatter = parseSimpleYaml(yamlBlock);

  // Validate required fields
  if (!frontmatter['name'] || !frontmatter['role'] || !frontmatter['version']) {
    console.warn(
      `[PromptLoader] Skipping ${filePath}: missing required frontmatter fields (name, role, version)`
    );
    return null;
  }

  const variables = frontmatter['variables'];

  return {
    frontmatter: {
      name: String(frontmatter['name']),
      role: String(frontmatter['role']),
      version: String(frontmatter['version']),
      description: frontmatter['description'] ? String(frontmatter['description']) : undefined,
      variables: Array.isArray(variables) ? variables.map(String) : undefined,
    } satisfies PromptFrontmatter,
    body: body.trim(),
    filePath,
  };
}

/**
 * Minimal YAML-subset parser for prompt frontmatter.
 *
 * Handles:
 * - `key: value`          → string
 * - `key: 1.0.0`         → string (kept as string)
 * - `key:\n  - item`     → string[]
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of lines) {
    // List item
    if (line.match(/^\s+-\s+(.+)$/)) {
      const value = line.match(/^\s+-\s+(.+)$/)![1].trim();
      if (currentKey && currentList) {
        currentList.push(value);
      }
      continue;
    }

    // Key: value pair
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      // Flush previous list
      if (currentKey && currentList) {
        result[currentKey] = currentList;
      }

      const [, key, value] = kvMatch;
      currentKey = key;

      if (value.trim() === '') {
        // Possibly a list follows
        currentList = [];
      } else {
        currentList = null;
        result[key] = value.trim();
      }
    }
  }

  // Flush final list
  if (currentKey && currentList) {
    result[currentKey] = currentList;
  }

  return result;
}

// ---------------------------------------------------------------------------
// PromptLoader
// ---------------------------------------------------------------------------

export class PromptLoader {
  constructor(private readonly registry: PromptRegistry) {}

  /**
   * Load all `.md` files from `directoryPath` and register them.
   *
   * Non-markdown files are ignored. Files with invalid or missing frontmatter
   * are logged and skipped — they do not throw.
   *
   * @returns The number of prompts successfully loaded.
   */
  async loadDirectory(directoryPath: string): Promise<number> {
    const absolutePath = resolve(directoryPath);
    let entries: string[];

    try {
      entries = await readdir(absolutePath);
    } catch (err) {
      console.warn(
        `[PromptLoader] Could not read directory '${absolutePath}': ${(err as Error).message}`
      );
      return 0;
    }

    const markdownFiles = entries.filter((f) => extname(f) === '.md');

    let loaded = 0;

    for (const file of markdownFiles) {
      const filePath = join(absolutePath, file);
      const parsed = await this.loadFile(filePath);

      if (parsed) {
        this.registry.registerPrompt({
          role: parsed.frontmatter.role,
          name: parsed.frontmatter.name,
          version: parsed.frontmatter.version,
          template: parsed.body,
          variables: parsed.frontmatter.variables ?? [],
          metadata: parsed.frontmatter.description
            ? { description: parsed.frontmatter.description }
            : undefined,
        });
        loaded++;
      }
    }

    return loaded;
  }

  /**
   * Load and parse a single prompt file.
   *
   * Returns null if the file cannot be read or is invalid.
   */
  async loadFile(filePath: string): Promise<ParsedPrompt | null> {
    let source: string;

    try {
      source = await readFile(filePath, 'utf-8');
    } catch (err) {
      console.warn(`[PromptLoader] Could not read file '${filePath}': ${(err as Error).message}`);
      return null;
    }

    return parsePromptFile(source, filePath);
  }
}
