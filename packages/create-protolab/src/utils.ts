/**
 * Utilities for create-protolab CLI
 * Simplified versions of @automaker/utils to avoid external dependencies
 */

/**
 * Logger interface
 */
export interface Logger {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

/**
 * Create a logger instance with a context prefix
 * Simplified version for CLI usage
 */
export function createLogger(context: string): Logger {
  const prefix = `[${context}]`;

  return {
    error: (...args: unknown[]) => console.error(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    info: (...args: unknown[]) => console.log(prefix, ...args),
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
  };
}
