/**
 * Triage Evidence Verifier (#3972)
 *
 * Guards against the silent failure mode where a triage agent confidently
 * classifies an issue (`already_fixed`, `duplicate`, ...) while citing file
 * paths that do not exist in the repository — neutralizing a real bug while
 * looking like progress.
 *
 * This is deterministic, LLM-free verification: given the file paths an agent
 * cites as evidence, it confirms each one actually exists at the relevant git
 * ref and refuses closure-equivalent classifications whose evidence cannot be
 * found. Triage agents are instructed to call this (via the
 * `verify_triage_evidence` MCP tool) before applying any closure-equivalent
 * label, and the regression suite asserts a fabricated reference is rejected.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import { createGitExecEnv } from '@protolabsai/git-utils';

const execFileAsync = promisify(execFile);
const logger = createLogger('TriageEvidenceVerifier');

/**
 * Classifications that close or neutralize an issue. These must never be
 * asserted on unverified evidence — a wrong one silently kills a real bug.
 * Compared after normalizing case and separators (so `already-fixed`,
 * `already_fixed`, and `Already Fixed` all match).
 */
export const CLOSURE_EQUIVALENT_CLASSIFICATIONS = [
  'already_fixed',
  'duplicate',
  'not_a_bug',
  'wontfix',
  'resolved',
  'not_reproducible',
  'invalid',
  'works_as_intended',
] as const;

export interface VerifyTriageEvidenceInput {
  /** Absolute path to the repository being triaged. */
  projectPath: string;
  /** The classification the agent intends to apply (optional). */
  classification?: string;
  /** File paths the agent cites as evidence for its classification. */
  citedPaths: string[];
  /** Git ref to check paths against. Defaults to 'HEAD'. */
  ref?: string;
}

export interface VerifyTriageEvidenceResult {
  ref: string;
  existingPaths: string[];
  missingPaths: string[];
  /** Whether the intended classification is closure-equivalent. */
  isClosureEquivalent: boolean;
  /**
   * False when a closure-equivalent classification is unsupported — either it
   * cites a path that doesn't exist, or it cites no evidence at all. When false,
   * the agent must NOT apply the classification.
   */
  classificationAllowed: boolean;
  /**
   * Whether the requested git ref could be resolved. When false, paths could
   * not be checked, so no closure-equivalent classification is permitted.
   */
  refResolved: boolean;
  /** Human-readable guidance for the agent. */
  recommendation: string;
}

/** Normalize a classification string for matching (case + separator insensitive). */
function normalizeClassification(classification: string): string {
  return classification
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function isClosureEquivalent(classification?: string): boolean {
  if (!classification) return false;
  return (CLOSURE_EQUIVALENT_CLASSIFICATIONS as readonly string[]).includes(
    normalizeClassification(classification)
  );
}

/**
 * Confirm a git ref resolves to a commit in the repo. Distinguishes "the ref is
 * bad" from "the path is missing" so an invalid ref can't masquerade as missing
 * evidence (which would otherwise produce misleading per-path results).
 */
async function refResolves(projectPath: string, ref: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      cwd: projectPath,
      env: createGitExecEnv(),
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Confirm a path exists at a git ref. `git cat-file -e <ref>:<path>` exits 0 if
 * the blob/tree exists. execFile (no shell) keeps arbitrary paths injection-safe.
 */
async function pathExistsAtRef(
  projectPath: string,
  ref: string,
  filePath: string
): Promise<boolean> {
  const clean = filePath.replace(/^\.?\//, '');
  try {
    await execFileAsync('git', ['cat-file', '-e', `${ref}:${clean}`], {
      cwd: projectPath,
      env: createGitExecEnv(),
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function verifyTriageEvidence(
  input: VerifyTriageEvidenceInput
): Promise<VerifyTriageEvidenceResult> {
  const ref = input.ref?.trim() || 'HEAD';
  const citedPaths = [...new Set((input.citedPaths ?? []).map((p) => p.trim()).filter(Boolean))];

  // An unresolvable ref means we cannot verify any evidence. Fail safe: never
  // permit a closure-equivalent classification we couldn't check.
  if (!(await refResolves(input.projectPath, ref))) {
    const closure = isClosureEquivalent(input.classification);
    if (closure) {
      logger.warn(
        `Triage evidence verification could not resolve ref "${ref}" — refusing closure verdict "${input.classification}"`
      );
    }
    return {
      ref,
      existingPaths: [],
      missingPaths: citedPaths,
      isClosureEquivalent: closure,
      classificationAllowed: !closure,
      refResolved: false,
      recommendation:
        `Could not resolve git ref "${ref}" in this repository, so cited evidence cannot be verified. ` +
        (closure
          ? `Do not apply the closure-equivalent classification "${input.classification}". `
          : '') +
        `Re-run against a valid ref (e.g. HEAD or a commit SHA).`,
    };
  }

  const existingPaths: string[] = [];
  const missingPaths: string[] = [];
  for (const p of citedPaths) {
    const exists = await pathExistsAtRef(input.projectPath, ref, p);
    (exists ? existingPaths : missingPaths).push(p);
  }

  const closure = isClosureEquivalent(input.classification);
  // A closure-equivalent verdict requires at least one cited path AND every
  // cited path must exist. Non-closure classifications are always allowed
  // (the result still surfaces missing paths as a warning).
  const classificationAllowed = !closure || (citedPaths.length > 0 && missingPaths.length === 0);

  let recommendation: string;
  if (closure && !classificationAllowed) {
    if (citedPaths.length === 0) {
      recommendation =
        `REJECT classification "${input.classification}": closure-equivalent verdicts require verified ` +
        `evidence (a file:line or commit reference that exists at ${ref}); none was cited. ` +
        `Re-investigate against the real source, cite verified evidence, or escalate as needs-investigation.`;
    } else {
      recommendation =
        `REJECT classification "${input.classification}": ${missingPaths.length} cited path(s) do not exist ` +
        `at ${ref} (${missingPaths.join(', ')}). Do not assert a closure-equivalent verdict against a ` +
        `non-existent codebase. Re-investigate against the real source and either cite verified file:line ` +
        `evidence or escalate as needs-investigation.`;
    }
  } else if (missingPaths.length > 0) {
    recommendation =
      `WARNING: ${missingPaths.length} of ${citedPaths.length} cited path(s) do not exist at ${ref} ` +
      `(${missingPaths.join(', ')}). Verify your evidence before relying on it.`;
  } else if (citedPaths.length === 0) {
    recommendation = `No paths cited. Cite the file:line evidence that supports your assessment.`;
  } else {
    recommendation = `All ${citedPaths.length} cited path(s) exist at ${ref}.`;
  }

  if (!classificationAllowed) {
    logger.warn(
      `Triage evidence verification rejected "${input.classification}" at ${ref} — missing: [${missingPaths.join(', ')}], cited: ${citedPaths.length}`
    );
  }

  return {
    ref,
    existingPaths,
    missingPaths,
    isClosureEquivalent: closure,
    classificationAllowed,
    refResolved: true,
    recommendation,
  };
}
