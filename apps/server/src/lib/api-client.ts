/**
 * API Client - Retry wrapper for external API calls with exponential backoff
 *
 * Provides a wrapper for individual API requests with:
 * - Exponential backoff retry (1s, 2s, 4s)
 * - Provider-specific rate limit delays
 * - Retry on retryable errors (429, 5xx, network)
 * - Max 3 retries per request
 * - Comprehensive logging
 *
 * This wrapper is for individual API calls ONLY, not workflow-level retries.
 * Use this for wrapping calls to GitHub, Discord, Graphite, and other external APIs.
 */

import { createLogger, classifyError } from '@automaker/utils';

const logger = createLogger('ApiClient');

/**
 * Supported API providers with specific rate limit handling
 */
export type ApiProvider = 'discord' | 'github' | 'graphite' | 'generic';

/**
 * Provider-specific configuration for rate limit delays
 * These delays are added BEFORE the exponential backoff delay
 */
const PROVIDER_DELAYS: Record<ApiProvider, number> = {
  discord: 500, // Discord has aggressive rate limits
  github: 1000, // GitHub requires 1s minimum between retries
  graphite: 1000, // Graphite uses GitHub API underneath
  generic: 0, // No provider-specific delay
};

/**
 * Exponential backoff delays in milliseconds
 * Applied after provider-specific delays
 */
const BACKOFF_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

/**
 * Maximum number of retries per request
 */
const MAX_RETRIES = 3;

/**
 * Options for API request with retry
 */
export interface ApiRequestOptions<T> {
  /**
   * The API provider (determines rate limit handling)
   */
  provider?: ApiProvider;

  /**
   * Optional custom retry count (default: 3)
   */
  maxRetries?: number;

  /**
   * Optional context for logging (e.g., "create PR", "send message")
   */
  context?: string;

  /**
   * Optional AbortSignal for cancellation
   */
  signal?: AbortSignal;
}

/**
 * Result from API request with retry metadata
 */
export interface ApiRequestResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  retriedErrors?: string[];
}

/**
 * Check if an error is retryable
 * Retries on: 429 (rate limit), 5xx (server errors), network errors
 * Does NOT retry on: 4xx client errors (except 429), abort errors
 */
function isRetryableError(error: unknown): boolean {
  const info = classifyError(error);
  const message = info.message.toLowerCase();

  // Don't retry abort/cancellation errors
  if (info.isAbort || info.isCancellation) {
    return false;
  }

  // Retry rate limits (429)
  if (info.isRateLimit) {
    return true;
  }

  // Retry network errors
  if (info.type === 'network') {
    return true;
  }

  // Retry 5xx server errors
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  ) {
    return true;
  }

  // Retry generic server errors
  if (
    message.includes('internal server error') ||
    message.includes('service unavailable') ||
    message.includes('gateway timeout')
  ) {
    return true;
  }

  // Don't retry other errors (4xx client errors, auth errors, etc.)
  return false;
}

/**
 * Sleep utility for backoff delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an API request with exponential backoff retry
 *
 * @param fn - The async function to execute (API call)
 * @param options - Request options including provider and context
 * @returns Result with data or error
 *
 * @example
 * ```typescript
 * const result = await executeWithRetry(
 *   async () => await fetch('https://api.github.com/repos/...'),
 *   { provider: 'github', context: 'fetch repo info' }
 * );
 *
 * if (result.success) {
 *   console.log('Data:', result.data);
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts:', result.error);
 * }
 * ```
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: ApiRequestOptions<T> = {}
): Promise<ApiRequestResult<T>> {
  const {
    provider = 'generic',
    maxRetries = MAX_RETRIES,
    context = 'API request',
    signal,
  } = options;

  const maxAttempts = Math.max(1, maxRetries);
  const retriedErrors: string[] = [];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Check for cancellation before each attempt
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      if (attempt > 0) {
        logger.info(`Retry attempt ${attempt + 1}/${maxAttempts} for ${context}`);
      }

      const data = await fn();

      if (attempt > 0) {
        logger.info(`${context} succeeded on retry attempt ${attempt + 1}`);
      }

      return {
        success: true,
        data,
        attempts: attempt + 1,
        retriedErrors: retriedErrors.length > 0 ? retriedErrors : undefined,
      };
    } catch (error) {
      lastError = error;
      const info = classifyError(error);

      // Log the error
      logger.debug(`${context} failed (attempt ${attempt + 1}/${maxRetries}): ${info.message}`);

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        logger.warn(`${context} failed with non-retryable error: ${info.message}`);
        return {
          success: false,
          error: info.message,
          attempts: attempt + 1,
        };
      }

      // Record the error for logging
      retriedErrors.push(info.message);

      // If this isn't the last attempt, wait before retrying
      if (attempt < maxRetries - 1) {
        // Calculate total delay: provider delay + exponential backoff
        const providerDelay = PROVIDER_DELAYS[provider];
        const backoffDelay = BACKOFF_DELAYS[attempt] || BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1];
        const totalDelay = providerDelay + backoffDelay;

        logger.info(
          `${context} failed (attempt ${attempt + 1}/${maxRetries}): ${info.message}. ` +
            `Retrying in ${totalDelay}ms (provider: ${providerDelay}ms, backoff: ${backoffDelay}ms)...`
        );

        // Wait for the delay
        await sleep(totalDelay);
      }
    }
  }

  // All retries exhausted
  const info = classifyError(lastError);
  logger.error(
    `${context} failed after ${maxRetries} attempts. ` +
      `Retried errors: ${retriedErrors.join(' | ')}`
  );

  return {
    success: false,
    error: info.message,
    attempts: maxRetries,
    retriedErrors,
  };
}

/**
 * API Client class for managing retryable API requests
 *
 * Provides a convenient interface for making API calls with automatic retry logic.
 * Can be used as a singleton or instantiated per-provider.
 */
export class ApiClient {
  constructor(private readonly defaultProvider: ApiProvider = 'generic') {}

  /**
   * Execute a request with retry logic
   *
   * @param fn - The async function to execute
   * @param options - Optional override options
   * @returns Result with data or error
   */
  async request<T>(
    fn: () => Promise<T>,
    options: Omit<ApiRequestOptions<T>, 'provider'> & { provider?: ApiProvider } = {}
  ): Promise<ApiRequestResult<T>> {
    return executeWithRetry(fn, {
      provider: options.provider ?? this.defaultProvider,
      maxRetries: options.maxRetries,
      context: options.context,
      signal: options.signal,
    });
  }

  /**
   * Execute a GitHub API request with retry
   */
  async github<T>(
    fn: () => Promise<T>,
    options: Omit<ApiRequestOptions<T>, 'provider'> = {}
  ): Promise<ApiRequestResult<T>> {
    return this.request(fn, { ...options, provider: 'github' });
  }

  /**
   * Execute a Discord API request with retry
   */
  async discord<T>(
    fn: () => Promise<T>,
    options: Omit<ApiRequestOptions<T>, 'provider'> = {}
  ): Promise<ApiRequestResult<T>> {
    return this.request(fn, { ...options, provider: 'discord' });
  }

  /**
   * Execute a Graphite API request with retry
   */
  async graphite<T>(
    fn: () => Promise<T>,
    options: Omit<ApiRequestOptions<T>, 'provider'> = {}
  ): Promise<ApiRequestResult<T>> {
    return this.request(fn, { ...options, provider: 'graphite' });
  }
}

/**
 * Default API client instance (generic provider)
 */
export const apiClient = new ApiClient('generic');

/**
 * GitHub-specific API client instance
 */
export const githubClient = new ApiClient('github');

/**
 * Discord-specific API client instance
 */
export const discordClient = new ApiClient('discord');

/**
 * Graphite-specific API client instance
 */
export const graphiteClient = new ApiClient('graphite');
