/**
 * @protolabsai/cli
 *
 * Programmatic API for the protomaker CLI.
 */

// Commander
export { Command } from 'commander';

// Output helpers
export { log, logError, output, successResult, errorResult } from './utils/output.js';
export type { OutputOptions } from './utils/output.js';

// Exit codes
export { EXIT_SUCCESS, EXIT_ERROR, EXIT_USAGE, exitUsage, exitError } from './utils/exit.js';

// Global flags
export { parseGlobalFlags } from './utils/flags.js';
export type { GlobalFlags } from './utils/flags.js';

// API client
export { APIClient, APIError, AuthError, ConnectionError, resolveAPIConfig } from './api/client.js';
export type { APIClientConfig, APIResponse } from './api/client.js';
