/**
 * Global CLI flag parsing.
 *
 * Shared across every command: --json, --quiet, --project.
 */

import path from 'node:path';

export interface GlobalFlags {
  /** Emit JSON output instead of human-readable text. */
  json: boolean;
  /** Suppress all non-essential output. */
  quiet: boolean;
  /** Project root path (defaults to cwd). */
  projectPath: string;
}

/**
 * Parse global flags from `process.argv`.
 *
 * Recognised flags:
 *   --json          JSON output mode
 *   --quiet         Suppress non-essential output
 *   --project <p>   Override project path (default: cwd)
 *
 * Returns the parsed flags and the remaining argv slice (with global flags stripped).
 */
export function parseGlobalFlags(argv: string[] = process.argv): GlobalFlags {
  const flags: GlobalFlags = {
    json: false,
    quiet: false,
    projectPath: process.cwd(),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--quiet') {
      flags.quiet = true;
    } else if (arg === '--project' && argv[i + 1]) {
      flags.projectPath = path.resolve(argv[i + 1]);
      i++; // skip next arg
    } else if (arg.startsWith('--project=')) {
      flags.projectPath = path.resolve(arg.split('=')[1]);
    }
  }

  // Resolve relative paths
  if (!path.isAbsolute(flags.projectPath)) {
    flags.projectPath = path.resolve(flags.projectPath);
  }

  return flags;
}
