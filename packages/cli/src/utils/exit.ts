/**
 * Exit-code discipline for the CLI.
 *
 *   0 — success
 *   1 — runtime error (network, auth, unexpected)
 *   2 — usage error (bad flags, missing args)
 */

// Exit codes
export const EXIT_SUCCESS = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

/**
 * Exit with a usage error (code 2).
 */
export function exitUsage(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(EXIT_USAGE);
}

/**
 * Exit with a runtime error (code 1).
 */
export function exitError(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(EXIT_ERROR);
}
