/**
 * CI Failure Evidence Collector
 *
 * Fetches structured failure evidence from GitHub check runs for a given PR.
 * Prefers annotations (structured file:line:message data) over raw log parsing.
 * Falls back to log excerpt extraction when annotations are unavailable.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { CIFailureEvidence } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { StateContext } from './lead-engineer-types.js';

const execAsync = promisify(exec);
const logger = createLogger('CIFailureEvidenceCollector');

/** Hard cap on log excerpt lines to prevent context window blowout. */
const MAX_LOG_LINES = 500;

/** Patterns that indicate test failure or assertion lines in CI logs. */
const FAILURE_PATTERNS = [
  /FAIL\b/i,
  /\bexpect\s*\(/,
  /\bError:/,
  /\bAssertionError/,
  /\breceived\b/i,
  /\bexpected\b/i,
  /\bat\s+/,
  /\breceived length/i,
  /\bexpected length/i,
  /\breceived array/i,
  /\breceived string/i,
  /\b-d\b/, // diff removed lines
  /\b\+d\b/, // diff added lines
];

/**
 * Fetch the repo slug (owner/repo) via `gh repo view`.
 */
async function getRepoSlug(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('gh repo view --json nameWithOwner -q .nameWithOwner', {
      cwd: projectPath,
      timeout: 10000,
    });
    return stdout.trim() || null;
  } catch (err) {
    logger.warn('Failed to fetch repo slug:', err);
    return null;
  }
}

/**
 * Fetch the head commit SHA for a PR via `gh pr view`.
 */
async function getPrHeadSha(projectPath: string, prNumber: number): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`gh pr view ${prNumber} --json headRefOid -q .headRefOid`, {
      cwd: projectPath,
      timeout: 10000,
    });
    return stdout.trim() || null;
  } catch (err) {
    logger.warn('Failed to fetch PR head SHA:', err);
    return null;
  }
}

/**
 * Fetch failed check runs for a commit via GitHub API.
 * Returns array of { id, name, html_url }.
 */
async function getFailedCheckRuns(
  slug: string,
  sha: string,
  projectPath: string
): Promise<Array<{ id: string; name: string; html_url: string }>> {
  try {
    const { stdout } = await execAsync(
      `gh api repos/${slug}/commits/${sha}/check-runs --jq '[.check_runs[] | select(.conclusion == "failure")] | [.[] | {id: (.id | tostring), name, html_url}]'`,
      { cwd: projectPath, timeout: 15000 }
    );
    const output = stdout.trim();
    if (!output || output === '[]') return [];
    return JSON.parse(output);
  } catch (err) {
    logger.warn('Failed to fetch failed check runs:', err);
    return [];
  }
}

/**
 * Fetch check run output (title, summary, annotations) for a specific check run.
 */
async function getCheckRunOutput(
  slug: string,
  checkRunId: string,
  projectPath: string
): Promise<{
  title?: string;
  summary?: string;
  annotations?: Array<{
    path?: string;
    start_line?: number;
    end_line?: number;
    annotation_level?: 'notice' | 'warning' | 'failure';
    message?: string;
    title?: string;
    raw_details?: string;
  }>;
} | null> {
  try {
    const { stdout } = await execAsync(
      `gh api repos/${slug}/check-runs/${checkRunId}/output --jq '{title: .title, summary: (.summary // ""), annotations: (.annotations // [])}'`,
      { cwd: projectPath, timeout: 15000 }
    );
    const output = stdout.trim();
    if (!output || output === '{}' || output === 'null') return null;
    return JSON.parse(output);
  } catch (err) {
    logger.warn(`Failed to fetch check run output for ${checkRunId}:`, err);
    return null;
  }
}

/**
 * Fetch the full check run log via `gh run view --log-failed`, truncated and filtered.
 */
async function getFailedStepLog(projectPath: string, prNumber: number): Promise<string | null> {
  try {
    // Get the workflow run ID for the PR
    const { stdout: runsOut } = await execAsync(
      `gh pr checks ${prNumber} --json databaseId -q .[].databaseId | head -1`,
      { cwd: projectPath, timeout: 10000 }
    );
    const runId = runsOut.trim();
    if (!runId) return null;

    const { stdout } = await execAsync(`gh run view ${runId} --log-failed 2>/dev/null || true`, {
      cwd: projectPath,
      timeout: 20000,
    });
    const lines = stdout.split('\n');
    // Take last MAX_LOG_LINES lines
    const truncated = lines.slice(-MAX_LOG_LINES);
    // Filter for failure-relevant lines
    const relevant = truncated.filter((line) => FAILURE_PATTERNS.some((pat) => pat.test(line)));
    // If filtering removed too much, return raw truncated
    return relevant.length > 0 ? relevant.join('\n') : truncated.join('\n');
  } catch (err) {
    logger.warn('Failed to fetch failed step log:', err);
    return null;
  }
}

/**
 * Extract test name and assertion details from a log excerpt or summary.
 */
function parseTestFailureDetails(text: string): {
  testFile?: string;
  testName?: string;
  assertion?: string;
  expectedValue?: string;
  receivedValue?: string;
  location?: string;
} {
  const result: {
    testFile?: string;
    testName?: string;
    assertion?: string;
    expectedValue?: string;
    receivedValue?: string;
    location?: string;
  } = {};

  // Extract test file from paths like "src/foo/bar.test.ts" or "tests/foo.spec.ts"
  const fileMatch = text.match(/([\w/.-]+(?:\.test|\.spec)\.(?:ts|js|tsx|jsx))/);
  if (fileMatch) {
    result.testFile = fileMatch[1];
  }

  // Extract test name: "describe('...')" or "it('...')" or "✓/✕ ..."
  const testNameMatch = text.match(/(?:describe|it|test)\s*\(\s*['"]([^'"]+)['"]/);
  if (testNameMatch) {
    result.testName = testNameMatch[1];
  }

  // Extract assertion: expect(...).to...
  const assertionMatch = text.match(/expect\s*\([^)]+\)\s*\.\w+(\([^)]*\))?/);
  if (assertionMatch) {
    result.assertion = assertionMatch[0];
  }

  // Extract expected value
  const expectedMatch = text.match(/(?:expected|Expected)[^:]*:\s*(.+)/i);
  if (expectedMatch) {
    result.expectedValue = expectedMatch[1].trim();
  }

  // Extract received value
  const receivedMatch = text.match(/(?:received|Received)[^:]*:\s*(.+)/i);
  if (receivedMatch) {
    result.receivedValue = receivedMatch[1].trim();
  }

  // Extract file:line location
  const locationMatch = text.match(/([\w/.-]+\.\w+):(\d+)/);
  if (locationMatch) {
    result.location = `${locationMatch[1]}:${locationMatch[2]}`;
  }

  return result;
}

/**
 * Collect structured CI failure evidence for a PR's failed checks.
 *
 * Strategy:
 * 1. Fetch head SHA for the PR
 * 2. Fetch failed check runs via GitHub API
 * 3. For each failed check, fetch output + annotations
 * 4. Parse annotations for structured failure details
 * 5. Fall back to log parsing when annotations are empty
 */
export async function collectCIFailureEvidence(ctx: StateContext): Promise<CIFailureEvidence[]> {
  const { feature, projectPath } = ctx;
  const prNumber = feature.prNumber ?? ctx.prNumber;

  if (!prNumber) {
    logger.warn('No PR number available for CI evidence collection');
    return [];
  }

  const slug = await getRepoSlug(projectPath);
  if (!slug) {
    logger.warn('Could not resolve repo slug for CI evidence collection');
    return [];
  }

  const sha = await getPrHeadSha(projectPath, prNumber);
  if (!sha) {
    logger.warn(`Could not resolve head SHA for PR #${prNumber}`);
    return [];
  }

  const failedChecks = await getFailedCheckRuns(slug, sha, projectPath);
  if (failedChecks.length === 0) {
    return [];
  }

  const evidences: CIFailureEvidence[] = [];

  for (const check of failedChecks) {
    const evidence: CIFailureEvidence = {
      checkName: check.name,
      checkUrl: check.html_url,
    };

    // Fetch check run output
    const output = await getCheckRunOutput(slug, check.id, projectPath);

    if (output) {
      // Prefer annotations
      if (output.annotations && output.annotations.length > 0) {
        evidence.annotations = output.annotations;

        // Extract details from annotations
        const failureAnnotations = output.annotations.filter(
          (a) => a.annotation_level === 'failure'
        );

        if (failureAnnotations.length > 0) {
          const first = failureAnnotations[0];
          if (first.path) {
            evidence.testFile = first.path;
          }
          if (first.start_line) {
            evidence.location = `${first.path || 'unknown'}:${first.start_line}`;
          }
          if (first.message) {
            const parsed = parseTestFailureDetails(first.message);
            Object.assign(evidence, parsed);
            if (!evidence.testName && first.title) {
              evidence.testName = first.title;
            }
          }
          if (first.raw_details) {
            const parsed = parseTestFailureDetails(first.raw_details);
            Object.assign(evidence, parsed);
          }
        }

        // If annotations exist but no failure-level ones, use summary
        if (!evidence.testName && output.summary) {
          const parsed = parseTestFailureDetails(output.summary);
          Object.assign(evidence, parsed);
        }
      } else if (output.summary && output.summary.trim()) {
        // No annotations, parse summary
        const parsed = parseTestFailureDetails(output.summary);
        Object.assign(evidence, parsed);
        // Use summary as log excerpt if it's substantial
        if (output.summary.trim().length > 50) {
          evidence.logExcerpt = output.summary.trim().slice(0, 3000);
        }
      }
    }

    // If we still have no log excerpt, try fetching failed step logs
    if (!evidence.logExcerpt && !evidence.annotations?.length) {
      const log = await getFailedStepLog(projectPath, prNumber);
      if (log && log.trim().length > 10) {
        evidence.logExcerpt = log.trim().slice(0, 5000);
        // Try to parse details from the log
        const parsed = parseTestFailureDetails(log);
        Object.assign(evidence, parsed);
      }
    }

    evidences.push(evidence);
  }

  logger.info(
    `Collected CI failure evidence for ${evidences.length} failed check(s) on PR #${prNumber}`
  );

  return evidences;
}

/**
 * Format CI failure evidence as structured markdown for agent prompt injection.
 */
export function formatCIFailureEvidence(evidences: CIFailureEvidence[]): string {
  if (!evidences.length) return '';

  const parts: string[] = ['### CI Failure Evidence\n'];

  for (const ev of evidences) {
    parts.push(`**Failed check:** \`${ev.checkName}\``);
    if (ev.checkUrl) {
      parts.push(`[View on GitHub](${ev.checkUrl})`);
    }

    if (ev.testFile || ev.testName) {
      const testDesc = [ev.testFile, ev.testName].filter(Boolean).join(' — ');
      parts.push(`**Failing test:** \`${testDesc}\``);
    }

    if (ev.assertion) {
      parts.push(`**Assertion:** \`${ev.assertion}\``);
    }

    if (ev.expectedValue || ev.receivedValue) {
      const vals: string[] = [];
      if (ev.expectedValue) vals.push(`expected: ${ev.expectedValue}`);
      if (ev.receivedValue) vals.push(`received: ${ev.receivedValue}`);
      parts.push(`**Values:** ${vals.join(' → ')}`);
    }

    if (ev.location) {
      parts.push(`**Location:** \`${ev.location}\``);
    }

    if (ev.annotations && ev.annotations.length > 0) {
      const failureAnns = ev.annotations.filter((a) => a.annotation_level === 'failure');
      if (failureAnns.length > 0) {
        parts.push('**Annotations:**');
        for (const ann of failureAnns.slice(0, 5)) {
          const loc = ann.path
            ? `${ann.path}${ann.start_line ? ':' + ann.start_line : ''}`
            : 'unknown';
          parts.push(`- \`${loc}\`: ${ann.message || ann.title || '(no message)'}`);
        }
      }
    }

    if (ev.logExcerpt) {
      parts.push('**Log excerpt:**');
      parts.push('```');
      // Cap at MAX_LOG_LINES to prevent context blowout
      const lines = ev.logExcerpt.split('\n').slice(0, MAX_LOG_LINES);
      parts.push(...lines);
      parts.push('```');
    }

    parts.push('');
  }

  return parts.join('\n');
}
