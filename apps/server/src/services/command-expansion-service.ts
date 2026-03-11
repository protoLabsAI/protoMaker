/**
 * CommandExpansionService — expands slash command bodies for the chat endpoint.
 *
 * Expansion rules (matching Claude Code SDK behavior):
 *   - $ARGUMENTS  → full argument string after command name
 *   - $1, $2, … → positional arguments (space-separated)
 *   - @filepath   → replaced with file contents (resolved from projectPath)
 *   - `!cmd`      → execute bash command, replace with stdout
 *
 * All expansions degrade gracefully: missing files and failed commands emit a
 * warning log and leave a human-readable placeholder in the expanded text.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '@protolabsai/utils';

const execAsync = promisify(exec);
const logger = createLogger('CommandExpansionService');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExpansionContext {
  /** Full argument string after the command name (may be empty). */
  argumentString: string;
  /** Positional arguments split from argumentString on whitespace. */
  positionalArgs: string[];
  /** Absolute project root path used to resolve @filepath references. */
  projectPath?: string;
}

export interface ParsedSlashCommand {
  name: string;
  argumentString: string;
  positionalArgs: string[];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a slash command from the leading text of a user message.
 *
 * "/mycommand arg1 arg2" → { name: 'mycommand', argumentString: 'arg1 arg2', positionalArgs: ['arg1', 'arg2'] }
 *
 * Returns null when the text does not start with a `/`.
 */
export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const withoutSlash = trimmed.slice(1);
  const spaceIdx = withoutSlash.search(/\s/);

  let name: string;
  let argumentString: string;

  if (spaceIdx === -1) {
    name = withoutSlash;
    argumentString = '';
  } else {
    name = withoutSlash.slice(0, spaceIdx);
    argumentString = withoutSlash.slice(spaceIdx + 1).trim();
  }

  if (!name) return null;

  const positionalArgs = argumentString.length > 0 ? argumentString.split(/\s+/) : [];

  return { name, argumentString, positionalArgs };
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

/**
 * Expand placeholder tokens in a command body string.
 *
 * Expansion order:
 *   1. $ARGUMENTS → full argument string
 *   2. $N         → N-th positional argument (1-indexed; empty string when out of range)
 *   3. @filepath  → contents of the file at projectPath/filepath
 *   4. `!cmd`     → stdout of bash command executed in projectPath cwd
 */
export async function expandCommandBody(body: string, ctx: ExpansionContext): Promise<string> {
  let result = body;

  // 1. $ARGUMENTS — whole argument string
  result = result.replace(/\$ARGUMENTS/g, ctx.argumentString);

  // 2. $N — positional arguments (must come after $ARGUMENTS to avoid partial matches)
  result = result.replace(/\$(\d+)/g, (_match, numStr: string) => {
    const idx = parseInt(numStr, 10) - 1;
    return ctx.positionalArgs[idx] ?? '';
  });

  // 3. @filepath references
  //    Match @word/path patterns; stop at whitespace or end of line
  const fileRefPattern = /@([\w./\-]+)/g;
  const fileMatches = [...result.matchAll(fileRefPattern)];
  for (const match of fileMatches) {
    const [full, filePath] = match as unknown as [string, string];

    if (!ctx.projectPath) {
      logger.warn(`@file reference "${full}" skipped — no projectPath provided`);
      continue;
    }

    const absPath = path.isAbsolute(filePath) ? filePath : path.join(ctx.projectPath, filePath);

    try {
      const content = await fs.readFile(absPath, 'utf-8');
      result = result.replace(full, content);
    } catch (err) {
      logger.warn(`@file reference "${full}" could not be read:`, err);
      result = result.replace(full, `[file not found: ${filePath}]`);
    }
  }

  // 4. Backtick-bang commands: `!command`
  const bashPattern = /`!([^`]+)`/g;
  const bashMatches = [...result.matchAll(bashPattern)];
  for (const match of bashMatches) {
    const [full, command] = match as unknown as [string, string];
    try {
      const { stdout } = await execAsync(command, {
        cwd: ctx.projectPath,
        timeout: 10_000,
      });
      result = result.replace(full, stdout.trim());
    } catch (err) {
      logger.warn(`Backtick-bang command failed: \`!${command}\``, err);
      result = result.replace(full, `[command failed: ${command}]`);
    }
  }

  return result;
}
