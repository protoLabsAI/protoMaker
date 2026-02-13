import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

interface Logger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
}

/** Create a prefixed logger that writes to stderr (CLI convention) */
export function createLogger(prefix: string): Logger {
  return {
    info: (msg: string) => console.error(`[${prefix}]`, msg),
    warn: (msg: string) => console.error(`[${prefix}] WARN:`, msg),
    error: (msg: string) => console.error(`[${prefix}] ERROR:`, msg),
    debug: (msg: string) => {
      if (process.env.DEBUG) console.error(`[${prefix}] DEBUG:`, msg);
    },
  };
}

/** Default logger instance */
export const logger = createLogger('create-protolab');

/** Check if path exists */
export function exists(path: string): boolean {
  return existsSync(path);
}

/** Read and parse JSON file */
export function readJson(path: string): unknown {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

/** Write JSON file */
export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

/** Run a shell command and capture output */
export function runCmd(
  command: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args);
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => (stdout += data.toString()));
    proc.stderr?.on('data', (data: Buffer) => (stderr += data.toString()));

    proc.on('close', (code) => resolve({ code: code || 0, stdout, stderr }));
  });
}

/** Interpolate {{variable}} placeholders in a template string */
export function interpolateTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
}
