import { existsSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';

// Optional color support
let colors: any;
try {
  colors = require('picocolors');
} catch {
  colors = {
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    gray: (s: string) => s,
  };
}

// Minimal logger that writes to stderr (CLI convention)
export const logger = {
  info: (msg: string) => console.error(colors.cyan('[INFO]'), msg),
  warn: (msg: string) => console.error(colors.yellow('[WARN]'), msg),
  error: (msg: string) => console.error(colors.red('[ERROR]'), msg),
  debug: (msg: string) => console.error(colors.gray('[DEBUG]'), msg),
};

// Helper: Check if path exists
export function exists(path: string): boolean {
  return existsSync(path);
}

// Helper: Read JSON file
export function readJson(path: string): any {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

// Helper: Write JSON file
export function writeJson(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

// Helper: Run command
export function runCmd(
  command: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args);
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => (stdout += data.toString()));
    proc.stderr?.on('data', (data) => (stderr += data.toString()));

    proc.on('close', (code) => resolve({ code: code || 0, stdout, stderr }));
  });
}

// Helper: Interpolate template with variables
export function interpolateTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
}
