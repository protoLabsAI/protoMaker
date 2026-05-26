/**
 * Output helper — standard --json vs human-readable output.
 *
 * Every command uses this module to produce consistent output:
 *   --json  → structured JSON on stdout
 *   --quiet → suppress all non-error output
 *   default → human-readable text
 *
 * Exit codes:
 *   0 = success
 *   1 = runtime error
 *   2 = usage error (bad args, missing required flag, etc.)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Global CLI output mode. */
export type OutputMode = 'text' | 'json' | 'quiet';

/** Parsed global flags shared across all commands. */
export interface GlobalFlags {
  json: boolean;
  quiet: boolean;
  project: string;
}

/**
 * Resolve output mode from global flags.
 * --quiet takes precedence over --json.
 */
export function getOutputMode(flags: { json?: boolean; quiet?: boolean }): OutputMode {
  if (flags.quiet) return 'quiet';
  if (flags.json) return 'json';
  return 'text';
}

// ---------------------------------------------------------------------------
// Output functions
// ---------------------------------------------------------------------------

/**
 * Print output respecting the current output mode.
 *
 * - 'quiet'  → no output
 * - 'json'   → JSON.stringify on stdout
 * - 'text'   → raw string on stdout
 */
export function output(data: unknown, flags: { json?: boolean; quiet?: boolean }): void {
  const mode = getOutputMode(flags);

  if (mode === 'quiet') {
    return;
  }

  if (mode === 'json') {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }

  // text mode
  if (typeof data === 'string') {
    process.stdout.write(data + '\n');
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

/**
 * Print an error message to stderr.
 * Always prints (ignores --quiet) so errors are visible.
 */
export function error(msg: string): void {
  process.stderr.write('Error: ' + msg + '\n');
}

/**
 * Print a usage error to stderr and exit with code 2.
 */
export function usageError(msg: string): never {
  process.stderr.write('Usage error: ' + msg + '\n');
  process.exit(2);
}

/**
 * Exit with a runtime error (code 1).
 */
export function exitError(msg: string): never {
  process.stderr.write('Error: ' + msg + '\n');
  process.exit(1);
}
