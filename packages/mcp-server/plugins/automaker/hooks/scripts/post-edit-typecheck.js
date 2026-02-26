#!/usr/bin/env node
// post-edit-typecheck.js — PostToolUse hook for Edit/Write tool calls.
// Runs TypeScript type checking on .ts/.tsx files after they are edited.
// Fires on Edit and Write tool calls.
//
// Behavior:
//   - Silent (exit 0) if file is not .ts/.tsx
//   - Silent (exit 0) if no tsconfig.json found walking up from file
//   - Silent (exit 0) if tsc passes with no errors
//   - Exits non-zero with filtered error lines if type errors found (max 10 lines)

import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Read tool input from stdin (JSON payload from Claude hooks)
let input;
try {
  const raw = fs.readFileSync(0, 'utf8');
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

// Extract file_path from tool_input (PostToolUse hook format)
const filePath = input?.tool_input?.file_path;
if (!filePath) {
  process.exit(0);
}

// Only process .ts/.tsx files
if (!/\.(tsx?)$/.test(filePath)) {
  process.exit(0);
}

// Walk up from the edited file's directory to find the nearest tsconfig.json
function findTsConfig(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, 'tsconfig.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root without finding tsconfig.json
      return null;
    }
    current = parent;
  }
}

const fileDir = path.dirname(path.resolve(filePath));
const tsconfig = findTsConfig(fileDir);

if (!tsconfig) {
  process.exit(0);
}

const tsconfigDir = path.dirname(tsconfig);

// Run tsc --noEmit using execFileSync (NOT shell: true) for security
let tscOutput = '';
try {
  execFileSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
    cwd: tsconfigDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // tsc passed — exit 0 silently
  process.exit(0);
} catch (err) {
  // tsc failed — collect stdout and stderr
  if (err.stdout) tscOutput += err.stdout.toString();
  if (err.stderr) tscOutput += err.stderr.toString();
}

// Filter output to lines referencing the edited file (max 10 lines)
const resolvedFile = path.resolve(filePath);
const fileBasename = path.basename(filePath);

const errorLines = tscOutput
  .split('\n')
  .filter(line => line.includes(resolvedFile) || line.includes(fileBasename))
  .slice(0, 10);

if (errorLines.length === 0) {
  // No errors reference this file specifically — exit silently
  process.exit(0);
}

process.stderr.write(errorLines.join('\n') + '\n');
process.exit(1);
