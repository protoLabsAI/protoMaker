#!/usr/bin/env node
// =============================================================================
// Proto SDK smoke test
// =============================================================================
// Exercises @protolabsai/sdk's `query()` exactly the way apps/server's
// ProtoProvider does, against the live gateway, to confirm the agentic loop
// actually executes tools after the planning turn.
//
// Why this exists: protoCLI#307 ("agentic loop terminates after the planning
// turn") was an SDK-level bug where the agent emitted intent then stopped
// without running tools — surfacing in protoMaker as empty feature executions.
// This script is the fast, dependency-light way to verify the SDK <-> gateway
// path is healthy after an SDK bump, without spinning up the full board.
//
// What it does: runs a 2-step task that REQUIRES tool use after planning
// (write a file, then read it back) and verifies the file was really written.
// PASS means the loop continued past planning and executed tools.
//
// Usage (from repo root):
//   node scripts/smoke/proto-sdk-smoke.mjs                 # protolabs/smart x1
//   node scripts/smoke/proto-sdk-smoke.mjs protolabs/fast  # pick a model tier
//   node scripts/smoke/proto-sdk-smoke.mjs protolabs/smart 5   # run 5 iterations
//
// Credentials: reads GATEWAY_API_KEY / GATEWAY_BASE_URL. If they aren't already
// in the environment, the repo-root .env is auto-loaded (same file the prod
// LaunchAgent sources). No secrets are printed.
//
// Exit code: 0 if every iteration passed, 1 if any failed, 2 if misconfigured.
// =============================================================================

import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// --- Load repo-root .env (only fills vars not already set) -------------------
function loadDotEnv() {
  const envPath = join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

const gatewayKey = process.env.GATEWAY_API_KEY || process.env.OPENAI_API_KEY;
const gatewayBaseUrl =
  process.env.GATEWAY_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.proto-labs.ai/v1';
if (!gatewayKey) {
  console.error('No GATEWAY_API_KEY / OPENAI_API_KEY (and none in repo-root .env). Aborting.');
  process.exit(2);
}

// --- Resolve the SDK the same way the server would (root or apps/server) -----
const require = createRequire(join(REPO_ROOT, 'apps', 'server', 'package.json'));
let sdkDir;
try {
  sdkDir = dirname(require.resolve('@protolabsai/sdk/package.json'));
} catch (e) {
  console.error('Could not resolve @protolabsai/sdk — run `npm install` first.', e?.message || e);
  process.exit(2);
}
const sdkVersion = JSON.parse(readFileSync(join(sdkDir, 'package.json'), 'utf8')).version;
const { query } = await import(pathToFileURL(join(sdkDir, 'dist', 'index.mjs')).href);

const model = process.argv[2] || 'protolabs/smart';
const iterations = Math.max(1, parseInt(process.argv[3] || '1', 10));
const env = { ...process.env, OPENAI_API_KEY: gatewayKey, OPENAI_BASE_URL: gatewayBaseUrl };

const PROMPT =
  'Create a file named result.txt in the current working directory containing exactly the ' +
  'text PROTO_OK and nothing else. Then read the file back to confirm its contents. ' +
  'You must actually use your tools to perform these steps, not just describe them.';

console.log(
  `Proto SDK smoke | sdk=${sdkVersion} | model=${model} | baseURL=${gatewayBaseUrl} | iterations=${iterations}\n`
);

async function runOnce(i) {
  const cwd = mkdtempSync(join(tmpdir(), 'proto-sdk-smoke-'));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 150000);

  let assistantTurns = 0;
  let toolUses = 0;
  const toolNames = [];
  let resultSubtype = null;
  let streamError = null;

  try {
    const stream = query({
      prompt: PROMPT,
      options: {
        model,
        cwd,
        env,
        maxSessionTurns: 12,
        permissionMode: 'yolo',
        abortController: ac,
      },
    });
    for await (const msg of stream) {
      if (msg.type === 'assistant') {
        assistantTurns++;
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'tool_use') {
            toolUses++;
            toolNames.push(block.name);
          }
        }
      } else if (msg.type === 'result') {
        resultSubtype = msg.subtype;
      }
    }
  } catch (e) {
    streamError = e?.message || String(e);
  } finally {
    clearTimeout(timer);
  }

  const filePath = join(cwd, 'result.txt');
  const fileExists = existsSync(filePath);
  const content = fileExists ? readFileSync(filePath, 'utf8').trim() : null;
  const pass = fileExists && content === 'PROTO_OK' && toolUses > 0;

  console.log(
    `[${i}/${iterations}] ${pass ? 'PASS' : 'FAIL'} — turns=${assistantTurns} toolUses=${toolUses}` +
      ` [${toolNames.join(', ') || 'none'}] result=${resultSubtype} file=${fileExists} content=${JSON.stringify(content)}` +
      (streamError ? ` error=${streamError}` : '')
  );
  return pass;
}

let passed = 0;
for (let i = 1; i <= iterations; i++) {
  if (await runOnce(i)) passed++;
}

console.log(`\n=== ${passed}/${iterations} PASS ===`);
process.exit(passed === iterations ? 0 : 1);
