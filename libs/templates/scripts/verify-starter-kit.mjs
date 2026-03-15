/**
 * End-to-end verification script for the AI Agent App starter kit.
 *
 * Scaffolds the starter to a temp directory, verifies no placeholder tokens
 * remain, verifies no internal @protolabsai imports exist, then runs
 * `npm install` and `npm run build` to confirm the output compiles cleanly.
 *
 * Usage: node libs/templates/scripts/verify-starter-kit.mjs
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- resolve the compiled scaffold function from dist/ ------------------
// The dist/ lives in the main repo (build artifacts are not copied to worktrees).
// Walk up from this script's location to find the package root, then fall back
// to the sibling main-repo layout: worktrees/<name>/../../../libs/templates/dist
let distIndex = path.resolve(__dirname, '..', 'dist', 'index.js');
try {
  await fs.access(distIndex);
} catch {
  // Not found in worktree — try main repo path
  const mainRepo = path.resolve(__dirname, '..', '..', '..', '..', '..', 'libs', 'templates', 'dist', 'index.js');
  try {
    await fs.access(mainRepo);
    distIndex = mainRepo;
  } catch {
    console.error(`Cannot find compiled dist/index.js at:\n  ${distIndex}\n  ${mainRepo}`);
    console.error('Run: npm run build --workspace=libs/templates');
    process.exit(1);
  }
}
const { scaffoldAiAgentAppStarter } = await import(distIndex);

// ---- helpers -------------------------------------------------------------

/** Walk a directory recursively, yielding every file path. Skips node_modules and .git. */
async function* walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else {
      yield fullPath;
    }
  }
}

/** Return file paths that contain the given literal string. */
async function findFilesWithString(dir, needle) {
  const matches = [];
  for await (const filePath of walkFiles(dir)) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (content.includes(needle)) {
        matches.push(filePath);
      }
    } catch {
      // binary or unreadable — skip
    }
  }
  return matches;
}

/** Check that a pattern does NOT appear as an actual import (not in comments or strings mentioning "no imports from ..."). */
async function findFilesWithActualImport(dir, importPrefix) {
  const matches = [];
  const importRegex = new RegExp(`from\\s+['"]${importPrefix.replace('@', '\\@')}`);
  for await (const filePath of walkFiles(dir)) {
    const ext = path.extname(filePath);
    if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) continue;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (importRegex.test(content)) {
        matches.push(filePath);
      }
    } catch {
      // skip
    }
  }
  return matches;
}

/** Run a shell command synchronously, streaming output. Returns { success, output }. */
function run(cmd, cwd) {
  try {
    const output = execSync(cmd, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 5 * 60 * 1000, // 5 min
    });
    return { success: true, output };
  } catch (err) {
    return {
      success: false,
      output: (err.stdout ?? '') + '\n' + (err.stderr ?? '') + '\n' + (err.message ?? ''),
    };
  }
}

// ---- main ----------------------------------------------------------------

const PROJECT_NAME = 'my-agent';
const OUTPUT_DIR = path.join(tmpdir(), `verify-starter-kit-${Date.now()}`);

const results = [];

function pass(name, detail) {
  results.push({ status: 'PASS', name, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  results.push({ status: 'FAIL', name, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function info(msg) {
  console.log(`        ${msg}`);
}

console.log('\n=== AI Agent App Starter Kit — End-to-End Verification ===\n');
console.log(`Output dir: ${OUTPUT_DIR}`);
console.log(`Project name: ${PROJECT_NAME}\n`);

// Step 1: Scaffold
console.log('Step 1: Scaffolding...');
const result = await scaffoldAiAgentAppStarter({
  projectName: PROJECT_NAME,
  outputDir: OUTPUT_DIR,
});

if (!result.success) {
  fail('scaffold', result.error);
  process.exit(1);
}
pass('scaffold', `${result.filesCreated.length} top-level entries created`);

// Step 2: Check for @@PROJECT_NAME tokens
console.log('\nStep 2: Checking for @@PROJECT_NAME tokens...');
const tokenFiles = await findFilesWithString(OUTPUT_DIR, '@@PROJECT_NAME');
if (tokenFiles.length === 0) {
  pass('no-placeholder-tokens', 'no @@PROJECT_NAME tokens found');
} else {
  fail('no-placeholder-tokens', `${tokenFiles.length} file(s) still contain @@PROJECT_NAME`);
  for (const f of tokenFiles) {
    info(f.replace(OUTPUT_DIR, '<output>'));
  }
}

// Step 3: Check for @protolabsai actual imports (not comments)
console.log('\nStep 3: Checking for @protolabsai imports...');
const importFiles = await findFilesWithActualImport(OUTPUT_DIR, '@protolabsai');
if (importFiles.length === 0) {
  pass('no-internal-imports', 'no @protolabsai imports found');
} else {
  fail('no-internal-imports', `${importFiles.length} file(s) import from @protolabsai`);
  for (const f of importFiles) {
    info(f.replace(OUTPUT_DIR, '<output>'));
  }
}

// Step 4: npm install
console.log('\nStep 4: Running npm install --ignore-scripts --legacy-peer-deps...');
const install = run('npm install --ignore-scripts --legacy-peer-deps', OUTPUT_DIR);
if (install.success) {
  pass('npm-install', 'dependencies installed');
} else {
  fail('npm-install', 'npm install failed');
  console.error(install.output.slice(0, 2000));
}

// Step 5: npm run build (only if install succeeded)
if (install.success) {
  console.log('\nStep 5: Running npm run build...');
  const build = run('npm run build --workspaces --if-present', OUTPUT_DIR);
  if (build.success) {
    pass('npm-build', 'build completed successfully');
  } else {
    fail('npm-build', 'build failed');
    // Show last 60 lines of build output for diagnosis
    const lines = build.output.split('\n');
    const tail = lines.slice(-60).join('\n');
    console.error(tail);
  }
} else {
  results.push({ status: 'SKIP', name: 'npm-build', detail: 'skipped due to install failure' });
  console.log('\nStep 5: Skipping build (install failed)');
}

// Summary
console.log('\n=== Summary ===\n');
const passes = results.filter((r) => r.status === 'PASS').length;
const fails = results.filter((r) => r.status === 'FAIL').length;
const skips = results.filter((r) => r.status === 'SKIP').length;

for (const r of results) {
  const icon = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : 'SKIP';
  console.log(`  ${icon}  ${r.name}: ${r.detail ?? ''}`);
}

console.log(`\nTotal: ${passes} passed, ${fails} failed, ${skips} skipped\n`);

// Cleanup
try {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
} catch {
  // best-effort
}

if (fails > 0) {
  process.exit(1);
}
