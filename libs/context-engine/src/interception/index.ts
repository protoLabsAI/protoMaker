/**
 * Interception layer for context-engine.
 *
 * Exports the LargeFileHandler and related types for intercepting tool results
 * that exceed the configured token threshold.
 *
 * @see LargeFileHandler
 */

export { LargeFileHandler, DEFAULT_LARGE_FILE_THRESHOLD } from './large-file-handler.js';

export type {
  LargeFileInterceptionConfig,
  LargeFileRow,
  InterceptedResult,
  PassThroughResult,
  InterceptionResult,
} from './large-file-handler.js';
