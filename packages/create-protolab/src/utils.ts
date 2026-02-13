/**
 * Utility functions for create-protolab
 */

/**
 * Simple logger for create-protolab
 */
export function createLogger(namespace: string) {
  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      console.log(`[${namespace}] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      console.warn(`[${namespace}] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      console.error(`[${namespace}] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    },
  };
}
