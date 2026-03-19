/**
 * CI Failure Classifier Service
 *
 * Classifies CI check failures into one of three classes:
 *   - actionable : Code-level failure the agent can fix
 *   - infra      : Infrastructure / runner issue — skip remediation, escalate
 *   - flaky      : Intermittent failure — skip remediation, notify
 *
 * All classification is synchronous pattern-matching — no LLM calls, no I/O.
 */

import type { CIFailureClass } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('CIFailureClassifier');

interface ClassificationPattern {
  patterns: RegExp[];
  failureClass: CIFailureClass;
}

/**
 * Infrastructure failure patterns.
 * These indicate runner, environment, or GitHub Actions platform issues
 * that are not caused by the code under test.
 */
const INFRA_PATTERNS: ClassificationPattern = {
  failureClass: 'infra',
  patterns: [
    /runner.*lost/i,
    /runner.*disconnected/i,
    /job.*cancelled/i,
    /infrastructure error/i,
    /github actions.*unavailable/i,
    /exceeded.*resource limit/i,
    /out of memory/i,
    /disk.*full/i,
    /disk space/i,
    /oom.*kill/i,
    /signal: killed/i,
    /killed.*process/i,
    /worker.*crashed/i,
    /node.*exited.*signal/i,
    /docker.*pull.*failed/i,
    /no space left on device/i,
    /connection.*refused.*runner/i,
    /host.*unreachable/i,
    /self-hosted runner.*offline/i,
  ],
};

/**
 * Flaky test / intermittent failure patterns.
 * These indicate non-deterministic failures that are unlikely to be fixed
 * by a code change and should be skipped for remediation.
 */
const FLAKY_PATTERNS: ClassificationPattern = {
  failureClass: 'flaky',
  patterns: [
    /flaky/i,
    /intermittent/i,
    /retry.*exceeded/i,
    /timeout.*network/i,
    /network.*timeout/i,
    /ECONNRESET/i,
    /ENOTFOUND/i,
    /ECONNREFUSED/i,
    /socket hang up/i,
    /connection reset/i,
    /fetch.*timed? ?out/i,
    /request.*timed? ?out/i,
    /connect.*timed? ?out/i,
    /exceeded.*wait.*time/i,
    /test.*timed? ?out/i,
    /async callback.*timed? ?out/i,
    /exceeded timeout.*ms/i,
    /jest.*exceeded.*timeout/i,
    /vitest.*exceeded.*timeout/i,
    /rate.?limit/i,
    /too many requests/i,
    /503 service unavailable/i,
    /502 bad gateway/i,
    /random.*fail/i,
    /non-deterministic/i,
  ],
};

/**
 * Classify a CI check failure based on its name and output text.
 *
 * Returns 'infra' or 'flaky' if the output matches known non-actionable patterns.
 * Falls back to 'actionable' for all other failures.
 */
export function classifyCIFailure(checkName: string, output: string): CIFailureClass {
  const text = `${checkName}\n${output}`;

  // Infrastructure failures take priority
  for (const pattern of INFRA_PATTERNS.patterns) {
    if (pattern.test(text)) {
      logger.debug(`Classified "${checkName}" as infra (pattern: ${pattern})`);
      return 'infra';
    }
  }

  // Flaky / network failures
  for (const pattern of FLAKY_PATTERNS.patterns) {
    if (pattern.test(text)) {
      logger.debug(`Classified "${checkName}" as flaky (pattern: ${pattern})`);
      return 'flaky';
    }
  }

  logger.debug(`Classified "${checkName}" as actionable (no infra/flaky patterns matched)`);
  return 'actionable';
}

/**
 * CIFailureClassifierService — thin singleton wrapper around classifyCIFailure.
 * Exposes the classify function as an instance method for easier mocking in tests.
 */
export class CIFailureClassifierService {
  classify(checkName: string, output: string): CIFailureClass {
    return classifyCIFailure(checkName, output);
  }
}

export const ciFailureClassifier = new CIFailureClassifierService();
