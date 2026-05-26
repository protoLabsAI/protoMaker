/**
 * @protolabsai/cli
 *
 * Programmatic API for the protomaker CLI.
 */

export { Command } from 'commander';

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
