/**
 * @protolabsai/cli
 *
 * Programmatic API for the protomaker CLI.
 */

export { Command } from 'commander';

// Output helper
export {
  output,
  error,
  usageError,
  exitError,
  getOutputMode,
  type OutputMode,
  type GlobalFlags,
} from './output.js';

// API client
export {
  ApiClient,
  mapToApiError,
  type ApiResponse,
  type ApiError,
  type ApiErrorCategory,
  type ApiClientConfig,
  type HttpMethod,
} from './api-client.js';

// Config resolution
export { resolveApiConfig } from './config.js';
