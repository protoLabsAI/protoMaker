/**
 * Debug log utility that writes to a dedicated log file
 *
 * Use this for tracking specific debug events that need to persist
 * across server restarts and be easily reviewable.
 *
 * Log file: data/debug.log
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const DEBUG_LOG_PATH = path.join(DATA_DIR, 'debug.log');

// Ensure data directory exists
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // Ignore if already exists
}

/**
 * Write a debug log entry to the debug.log file
 *
 * @param category - Category/module name (e.g., 'FeatureLoader', 'UI', 'Branch')
 * @param message - Log message
 * @param data - Optional data to include (will be JSON stringified)
 */
export function debugLog(category: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
  const line = `[${timestamp}] [${category}] ${message}${dataStr}\n`;

  try {
    fs.appendFileSync(DEBUG_LOG_PATH, line);
  } catch (err) {
    console.error('[DebugLog] Failed to write:', err);
  }
}

/**
 * Clear the debug log file
 */
export function clearDebugLog(): void {
  try {
    fs.writeFileSync(DEBUG_LOG_PATH, '');
    debugLog('DebugLog', 'Log cleared');
  } catch (err) {
    console.error('[DebugLog] Failed to clear:', err);
  }
}

/**
 * Get the path to the debug log file
 */
export function getDebugLogPath(): string {
  return DEBUG_LOG_PATH;
}
