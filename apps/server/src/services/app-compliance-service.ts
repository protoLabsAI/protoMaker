/**
 * App Compliance Service
 *
 * Verifies a managed app meets the protoLabs fleet standard before protoMaker
 * runs auto-mode against it. The platform refuses to operate non-compliant apps
 * (a missing merge-blocking standard is "not worth the headache") and tells the
 * operator exactly what to set up.
 *
 * Default: HARD-REFUSE on verified non-compliance.
 * Escape hatch: set AUTOMAKER_SKIP_COMPLIANCE_CHECK=1 (truthy) to bypass — we
 * suggest the standard, we don't fight an operator's existing system.
 *
 * Checks are deliberately conservative: a check only counts as a *violation*
 * when it is positively verified absent. When it can't be determined (no remote,
 * gh unavailable, API/permission error) it is reported as "unverified" and does
 * NOT block — refusing to run a legitimate local/limited-permission repo would
 * be worse than the gap.
 */

import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';

const execAsync = promisify(exec);
const logger = createLogger('AppCompliance');

/** Env var operators can set (truthy) to bypass the compliance gate entirely. */
export const COMPLIANCE_SKIP_ENV = 'AUTOMAKER_SKIP_COMPLIANCE_CHECK';

export interface ComplianceViolation {
  /** Short stable id for the failing check. */
  check: 'gitignore' | 'branch-protection';
  /** Human-readable description of what's wrong. */
  message: string;
  /** What the operator should do to fix it. */
  remediation: string;
}

export interface ComplianceResult {
  /** True when there are no violations (or the gate was skipped). */
  compliant: boolean;
  /** True when the gate was bypassed via the opt-out env var. */
  skipped: boolean;
  violations: ComplianceViolation[];
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Branch-protection state for the default branch:
 * - 'present'    → an effective rule requires status checks before merge
 * - 'absent'     → verified that no such rule exists (a violation)
 * - 'unverified' → could not determine (no remote / gh missing / API error)
 */
async function checkBranchProtection(
  projectPath: string
): Promise<'present' | 'absent' | 'unverified'> {
  // Resolve owner/repo + default branch via gh (uses the repo's configured remote).
  let owner: string;
  let repo: string;
  let defaultBranch: string;
  try {
    const { stdout } = await execAsync('gh repo view --json owner,name,defaultBranchRef', {
      cwd: projectPath,
      timeout: 15000,
    });
    const data = JSON.parse(stdout.trim()) as {
      owner?: { login?: string };
      name?: string;
      defaultBranchRef?: { name?: string };
    };
    if (!data.owner?.login || !data.name || !data.defaultBranchRef?.name) return 'unverified';
    owner = data.owner.login;
    repo = data.name;
    defaultBranch = data.defaultBranchRef.name;
  } catch {
    return 'unverified';
  }

  // Query the effective rules applying to the default branch (combines modern
  // rulesets and classic branch protection).
  try {
    const { stdout } = await execAsync(
      `gh api "repos/${owner}/${repo}/rules/branches/${defaultBranch}" --jq '[.[].type]'`,
      { cwd: projectPath, timeout: 15000 }
    );
    const types = JSON.parse(stdout.trim() || '[]') as string[];
    return types.includes('required_status_checks') ? 'present' : 'absent';
  } catch {
    return 'unverified';
  }
}

/**
 * Check whether the app at `projectPath` meets the fleet standard.
 */
export async function checkAppCompliance(projectPath: string): Promise<ComplianceResult> {
  // Opt-out: don't fight people's systems.
  if (isTruthyEnv(process.env[COMPLIANCE_SKIP_ENV])) {
    logger.info(
      `[compliance] ${COMPLIANCE_SKIP_ENV} set — skipping compliance gate for ${projectPath}`
    );
    return { compliant: true, skipped: true, violations: [] };
  }

  const violations: ComplianceViolation[] = [];

  // 1. .gitignore present (always determinable from the working tree).
  if (!existsSync(join(projectPath, '.gitignore'))) {
    violations.push({
      check: 'gitignore',
      message: 'Repository has no .gitignore.',
      remediation:
        'Add a .gitignore (see the protoLabs recommended baseline scaffolded by create-protolab).',
    });
  }

  // 2. Default branch requires status checks before merge (best-effort).
  const bp = await checkBranchProtection(projectPath);
  if (bp === 'absent') {
    violations.push({
      check: 'branch-protection',
      message: 'The default branch has no required status checks (PRs can merge without CI).',
      remediation:
        'Apply branch protection requiring CI checks — e.g. the create-protolab branch-protection ruleset.',
    });
  }

  return { compliant: violations.length === 0, skipped: false, violations };
}

/**
 * Build a clear, operator-facing refusal message from compliance violations.
 */
export function buildComplianceRefusalMessage(
  projectPath: string,
  violations: ComplianceViolation[]
): string {
  const lines = [
    `protoMaker refused to run auto-mode for ${projectPath}: the app does not meet the fleet standard.`,
    '',
    'Issues to fix:',
    ...violations.map((v) => `  • [${v.check}] ${v.message}\n    → ${v.remediation}`),
    '',
    `Once fixed, retry. To bypass this gate (not recommended), set ${COMPLIANCE_SKIP_ENV}=1.`,
  ];
  return lines.join('\n');
}
