#!/usr/bin/env node
/**
 * One-shot invocation of BacklogTitleReconcilerCheck against the current repo's
 * .automaker/features directory. Clears zombie backlog features that match
 * recently merged PRs by title. Safe to re-run — the check is idempotent
 * (already-done features are skipped by filter, already-claimed PRs are skipped).
 *
 * This script exists so the initial backlog cleanup can run without waiting on
 * the server's 6h full-tier maintenance sweep. After the reconciler ships, the
 * scheduled sweep picks up any new zombies automatically.
 *
 * Run: node scripts/reconcile-backlog-once.mjs [threshold]  (default 0.4)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectPath = path.resolve(__dirname, '..');
const threshold = parseFloat(process.argv[2] ?? '0.4');

const { BacklogTitleReconcilerCheck } = await import(
  path.join(
    projectPath,
    'apps/server/dist/apps/server/src/services/maintenance/checks/backlog-title-reconciler-check.js'
  )
);
const { FeatureLoader } = await import(
  path.join(projectPath, 'apps/server/dist/apps/server/src/services/feature-loader.js')
);

// Minimal EventEmitter compat with the one the server uses.
const events = {
  emit: (type, payload) => console.log(`[event] ${type}: ${JSON.stringify(payload)}`),
};

const featureLoader = new FeatureLoader();
const check = new BacklogTitleReconcilerCheck(featureLoader, events, threshold);

console.log(
  `Running BacklogTitleReconcilerCheck against ${projectPath} (threshold=${threshold})...`
);
const result = await check.sweepProject(projectPath);
console.log(JSON.stringify(result, null, 2));
