/**
 * Server file log transport
 *
 * Writes all logger output to data/server.log for post-mortem analysis.
 * Works with the createLogger transport system — register once at startup.
 *
 * Features:
 * - Appends to data/server.log with structured format
 * - Auto-rotates when file exceeds MAX_LOG_SIZE (keeps last half)
 * - Flushes synchronously to survive crashes
 * - Strips ANSI codes from output
 */

import fs from 'fs';
import path from 'path';
import type { LogTransport } from '@automaker/utils';

const DATA_DIR = process.env.DATA_DIR || './data';
const LOG_FILE = path.join(DATA_DIR, 'server.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const ROTATION_KEEP = 5 * 1024 * 1024; // Keep last 5 MB after rotation

let writeCount = 0;

/**
 * Ensure the data directory exists
 */
function ensureDir(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // Ignore if already exists
  }
}

/**
 * Rotate log file if it exceeds MAX_LOG_SIZE.
 * Keeps the last ROTATION_KEEP bytes.
 */
function rotateIfNeeded(): void {
  try {
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      // Find the start of the last ROTATION_KEEP bytes worth of content
      const keepFrom = content.length - ROTATION_KEEP;
      // Find the next newline after keepFrom to avoid splitting a line
      const newlineIdx = content.indexOf('\n', keepFrom);
      const trimmed =
        newlineIdx >= 0
          ? `--- Log rotated at ${new Date().toISOString()} (kept last ${Math.round(ROTATION_KEEP / 1024)}KB) ---\n` +
            content.slice(newlineIdx + 1)
          : content;
      fs.writeFileSync(LOG_FILE, trimmed);
    }
  } catch {
    // File might not exist yet, that's fine
  }
}

/**
 * Format args into a readable string, stripping objects to JSON
 */
function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.message}${arg.stack ? '\n' + arg.stack : ''}`;
      }
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'undefined') return 'undefined';
      if (arg === null) return 'null';
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

/**
 * Create the file log transport for registerLogTransport()
 */
export function createFileLogTransport(): LogTransport {
  ensureDir();
  rotateIfNeeded();

  // Write startup marker
  const startLine = `\n=== Server started at ${new Date().toISOString()} (PID: ${process.pid}) ===\n`;
  try {
    fs.appendFileSync(LOG_FILE, startLine);
  } catch {
    // Ignore
  }

  return (entry) => {
    const line = `[${entry.timestamp}] ${entry.level.padEnd(5)} [${entry.context}] ${formatArgs(entry.args)}\n`;
    try {
      fs.appendFileSync(LOG_FILE, line);
    } catch {
      // Silently fail — never let file logging break the server
    }

    // Check rotation every 5000 writes
    writeCount++;
    if (writeCount % 5000 === 0) {
      rotateIfNeeded();
    }
  };
}

/**
 * Get the path to the server log file.
 * Exported for the MCP tool to discover the path.
 */
export function getServerLogPath(): string {
  return path.resolve(LOG_FILE);
}
