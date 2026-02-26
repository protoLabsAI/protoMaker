#!/usr/bin/env node
/**
 * PostToolUse Hook: TypeScript type-check on edited files
 *
 * Fires after Edit or Write tool calls. For .ts/.tsx files, walks up to find
 * the nearest tsconfig.json and runs tsc --noEmit. Filters output to lines
 * mentioning the edited file (max 10 lines). Silent for non-TS files or when
 * no tsconfig is found.
 *
 * Receives tool input via stdin as JSON. Exits non-zero with filtered errors
 * if type errors are found.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';

async function main() {
  // Read stdin to get hook input JSON
  let stdinData = '';
  try {
    for await (const chunk of process.stdin) {
      stdinData += chunk;
    }
  } catch {
    process.exit(0);
  }

  let hookInput;
  try {
    hookInput = JSON.parse(stdinData || '{}');
  } catch {
    process.exit(0);
  }

  // Claude Code provides tool_input for PostToolUse hooks
  const toolInput = hookInput.tool_input || hookInput;
  const filePath = toolInput.file_path || '';

  // Only process .ts/.tsx files
  if (!filePath || !/\.(tsx?)$/.test(filePath)) {
    process.exit(0);
  }

  // Walk up to find nearest tsconfig.json
  let dir = path.dirname(path.resolve(filePath));
  let tsconfig = null;
  while (true) {
    const candidate = path.join(dir, 'tsconfig.json');
    if (existsSync(candidate)) {
      tsconfig = candidate;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  if (!tsconfig) {
    process.exit(0);
  }

  try {
    execFileSync('npx', ['tsc', '--noEmit', '--pretty', 'false', '--project', tsconfig], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    // tsc passed cleanly
    process.exit(0);
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    // Filter to lines mentioning the edited file (max 10 lines)
    const basename = path.basename(filePath);
    const normalizedPath = filePath.replace(/\\/g, '/');
    const lines = output
      .split('\n')
      .filter((line) => line.includes(basename) || line.includes(normalizedPath));
    const trimmed = lines.slice(0, 10).join('\n').trim();
    if (trimmed) {
      process.stdout.write(trimmed + '\n');
      process.exit(1);
    }
    // No matching lines — type errors in other files, not the one we edited
    process.exit(0);
  }
}

main().catch(() => process.exit(0));
