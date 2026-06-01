/**
 * Error type classification
 */
export type ErrorType =
  | 'authentication'
  | 'config_corrupted'
  | 'cancellation'
  | 'abort'
  | 'execution'
  | 'rate_limit'
  | 'quota_exhausted'
  | 'max_turns'
  | 'network'
  | 'empty_stream'
  | 'unknown';

/**
 * Classified error information
 */
export interface ErrorInfo {
  type: ErrorType;
  message: string;
  isAbort: boolean;
  isAuth: boolean;
  isConfigCorrupted: boolean; // Config/credentials file unreadable or truncated (often disk-full)
  isCancellation: boolean;
  isRateLimit: boolean;
  isQuotaExhausted: boolean; // Session/weekly usage limit reached
  isMaxTurns: boolean; // Agent exceeded max turn limit
  isEmptyStream: boolean; // Model stream ended with empty/minimal response (gateway timeout)
  retryAfter?: number; // Seconds to wait before retrying (for rate limit errors)
  originalError: unknown;
}
