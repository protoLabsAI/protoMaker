/**
 * Output helpers for --json vs human-readable output.
 *
 * Every command uses these helpers so output format is consistent
 * across the CLI.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutputOptions {
  /** Emit JSON instead of human-readable text. */
  json?: boolean;
  /** Suppress all non-essential output. */
  quiet?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Print a message to stdout. Skips when `quiet` is true.
 */
export function log(message: string, opts: OutputOptions = {}): void {
  if (opts.quiet) {
    return;
  }
  console.log(message);
}

/**
 * Print an error message to stderr. Always prints (ignores `quiet`).
 */
export function logError(message: string): void {
  console.error(message);
}

/**
 * Print a structured result as JSON (when `json` flag is set) or as a
 * plain string (when in human mode).
 */
export function output(result: unknown, opts: OutputOptions = {}): void {
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!opts.quiet) {
    if (typeof result === 'string') {
      console.log(result);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  }
}

/**
 * Format a success payload for consistent --json output.
 */
export function successResult(data: unknown): { success: true; data: unknown } {
  return { success: true, data };
}

/**
 * Format an error payload for consistent --json output.
 */
export function errorResult(
  message: string,
  code?: string
): { success: false; error: string; code?: string } {
  return { success: false, error: message, code };
}
