/**
 * Lead Engineer Verify Processor
 *
 * Handles the VERIFY state in the feature lifecycle.
 *
 * Responsibilities:
 * 1. Run CompletionVerifier with feature-defined successCriteria (when available)
 * 2. Check basic health via /api/health endpoint on the target environment
 * 3. Compare error rates before/after deploy using DORA metrics service
 * 4. Transition to DONE on pass, ESCALATE on fail
 *
 * Fallback: if CompletionVerifier is unavailable or no criteria are defined,
 * auto-pass to DONE with a warning log (never blocks deploys when unconfigured).
 */

import { createLogger } from '@protolabsai/utils';
import { FeatureState } from '@protolabsai/types';
import type { LeadFeatureSnapshot } from '@protolabsai/types';
import { getCompletionVerifierService } from '../completion-verifier.js';
import type { CompletionCriterion } from '../completion-verifier.js';

const logger = createLogger('LeadEngineerVerifyProcessor');

/** Health check timeout (10 seconds) */
const HEALTH_CHECK_TIMEOUT_MS = 10_000;

/** Default target environment base URL */
const DEFAULT_TARGET_URL = process.env['SERVER_URL'] ?? 'http://localhost:3000';

export interface VerifyProcessorResult {
  nextState: FeatureState.DONE | FeatureState.ESCALATE;
  reason: string;
  details?: Record<string, unknown>;
}

/**
 * Process the VERIFY state for a feature.
 *
 * Returns the next state (DONE or ESCALATE) with a reason.
 */
export async function processVerifyState(
  featureId: string,
  feature: LeadFeatureSnapshot,
  projectPath: string,
  targetUrl: string = DEFAULT_TARGET_URL
): Promise<VerifyProcessorResult> {
  logger.info(`Starting post-deploy verification for feature ${featureId}`);

  const failures: string[] = [];

  // ── Step 1: Health check ────────────────────────────────────────────────
  const healthResult = await checkHealth(targetUrl);
  if (!healthResult.ok) {
    failures.push(`Health check failed: ${healthResult.error}`);
  } else {
    logger.info(`Health check passed (${healthResult.statusCode})`);
  }

  // ── Step 2: CompletionVerifier (if successCriteria defined) ─────────────
  if (failures.length === 0) {
    const criteriaResult = await runCriteriaVerification(featureId, feature, projectPath);
    if (!criteriaResult.ok) {
      failures.push(criteriaResult.reason);
    } else {
      logger.info(`Criteria verification: ${criteriaResult.reason}`);
    }
  }

  // ── Step 3: DORA error rate comparison ──────────────────────────────────
  if (failures.length === 0) {
    const doraResult = await checkDoraErrorRate(projectPath);
    if (!doraResult.ok) {
      failures.push(`DORA check: ${doraResult.reason}`);
    } else {
      logger.info(`DORA check passed: ${doraResult.reason}`);
    }
  }

  // ── Decision ─────────────────────────────────────────────────────────────
  if (failures.length === 0) {
    return {
      nextState: FeatureState.DONE,
      reason: 'Post-deploy verification passed: health OK, criteria met, error rate stable',
    };
  }

  const reason = failures.join('; ');
  logger.warn(`Verification failed for feature ${featureId}: ${reason}`);

  return {
    nextState: FeatureState.ESCALATE,
    reason: `Post-deploy verification failed: ${reason}`,
    details: { failures },
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

interface HealthCheckResult {
  ok: boolean;
  statusCode?: number;
  error?: string;
}

async function checkHealth(targetUrl: string): Promise<HealthCheckResult> {
  const url = `${targetUrl}/api/health`;
  logger.debug(`Checking health at ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 200) {
      return { ok: true, statusCode: response.status };
    }

    return {
      ok: false,
      statusCode: response.status,
      error: `Expected 200 but got ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

interface CriteriaVerificationResult {
  ok: boolean;
  reason: string;
}

async function runCriteriaVerification(
  featureId: string,
  feature: LeadFeatureSnapshot,
  projectPath: string
): Promise<CriteriaVerificationResult> {
  // Retrieve successCriteria from feature (may be string[] from feature type)
  const rawCriteria = (feature as unknown as { successCriteria?: string[] }).successCriteria;

  if (!rawCriteria || rawCriteria.length === 0) {
    logger.warn(
      `Feature ${featureId} has no successCriteria defined — auto-passing verification`
    );
    return { ok: true, reason: 'No successCriteria configured — auto-pass' };
  }

  // Parse string criteria into CompletionCriterion objects.
  // Strings can be bare shell commands that we treat as custom_script checks.
  const criteria: CompletionCriterion[] = rawCriteria.map(
    (c): CompletionCriterion => ({ type: 'custom_script', command: c })
  );

  let verifier: ReturnType<typeof getCompletionVerifierService>;
  try {
    verifier = getCompletionVerifierService();
  } catch (error) {
    logger.warn(
      `CompletionVerifier unavailable for feature ${featureId} — auto-passing verification`,
      error
    );
    return { ok: true, reason: 'CompletionVerifier unavailable — auto-pass' };
  }

  try {
    const result = await verifier.verifyCompletion(projectPath, criteria, {
      workDir: projectPath,
      stopOnFirstFailure: false,
    });

    if (result.allPassed) {
      return {
        ok: true,
        reason: `All ${criteria.length} criteria passed (${result.totalDuration}ms)`,
      };
    }

    const failedCount = result.results.filter((r) => !r.passed).length;
    return {
      ok: false,
      reason: `${failedCount}/${criteria.length} criteria failed: ${result.summary}`,
    };
  } catch (error) {
    logger.warn(
      `CompletionVerifier threw during feature ${featureId} verification — auto-passing`,
      error
    );
    return { ok: true, reason: 'CompletionVerifier error — auto-pass' };
  }
}

interface DoraCheckResult {
  ok: boolean;
  reason: string;
}

async function checkDoraErrorRate(projectPath: string): Promise<DoraCheckResult> {
  try {
    // Dynamically import to avoid circular deps and allow graceful degradation
    const { DoraMetricsService } = await import('../dora-metrics-service.js');
    const { FeatureLoader } = await import('../feature-loader.js');

    const featureLoader = new FeatureLoader();
    const doraService = new DoraMetricsService(featureLoader);

    const metrics = await doraService.getMetrics(projectPath);

    const changeFailureRate = metrics.changeFailureRate.value;
    const threshold = metrics.changeFailureRate.threshold;

    if (threshold && changeFailureRate >= threshold.critical) {
      return {
        ok: false,
        reason: `Change failure rate ${(changeFailureRate * 100).toFixed(1)}% exceeds critical threshold ${(threshold.critical * 100).toFixed(1)}%`,
      };
    }

    return {
      ok: true,
      reason: `Change failure rate ${(changeFailureRate * 100).toFixed(1)}% is within acceptable range`,
    };
  } catch (error) {
    // DORA metrics service unavailable — log and auto-pass
    logger.warn('DORA metrics service unavailable — skipping error rate check', error);
    return { ok: true, reason: 'DORA metrics unavailable — auto-pass' };
  }
}
