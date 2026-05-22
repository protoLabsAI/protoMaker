#!/usr/bin/env node
/**
 * Posts a code-review findings report as a sticky PR comment.
 *
 * Reads from REPORT_PATH and PR_NUMBER env vars; uses the `gh` CLI to PATCH
 * an existing marker-tagged comment on re-runs instead of stacking new ones.
 *
 * Designed to be called from .github/workflows/code-review.yml. The review
 * itself is produced by `@protolabsai/release-tools review-code` via the
 * LiteLLM gateway.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MARKER = '<!-- code-review:findings -->';

const reportPath = process.env.REPORT_PATH;
const prNumber = process.env.PR_NUMBER;
const findingsCount = process.env.FINDINGS_COUNT || '?';

if (!reportPath || !prNumber) {
  console.error('REPORT_PATH and PR_NUMBER must be set');
  process.exit(0); // non-blocking
}

let report;
try {
  report = readFileSync(reportPath, 'utf8');
} catch (err) {
  console.error(`Cannot read report at ${reportPath}: ${err.message}`);
  process.exit(0);
}

const body = `${MARKER}
## Code Review — ${findingsCount} finding(s)

> Async review running parallel to CodeRabbit. Findings are advisory; not all are merge blockers.

${report}
`;

function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', ...opts });
}

const workdir = mkdtempSync(join(tmpdir(), 'code-review-'));
const bodyFile = join(workdir, 'body.md');
writeFileSync(bodyFile, body);

let existingId = null;
try {
  const comments = JSON.parse(gh(['pr', 'view', prNumber, '--json', 'comments']));
  const match = (comments.comments ?? []).find((c) => c.body?.includes(MARKER));
  if (match) existingId = match.id;
} catch (err) {
  console.error(`Failed to list comments (continuing as new): ${err.message}`);
}

if (existingId) {
  try {
    const payloadFile = join(workdir, 'patch.json');
    writeFileSync(payloadFile, JSON.stringify({ body }));
    gh([
      'api',
      '--method',
      'PATCH',
      `/repos/{owner}/{repo}/issues/comments/${existingId}`,
      '--input',
      payloadFile,
    ]);
    console.log(`Updated existing code-review comment ${existingId}`);
    process.exit(0);
  } catch (err) {
    console.error(`Patch failed, posting new comment instead: ${err.message}`);
  }
}

try {
  gh(['pr', 'comment', prNumber, '--body-file', bodyFile]);
  console.log('Posted new code-review comment');
} catch (err) {
  console.error(`Failed to post comment: ${err.message}`);
  process.exit(0);
}
