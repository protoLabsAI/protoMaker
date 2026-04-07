/**
 * Cross-Repository Dependency Resolver
 *
 * Checks whether a feature's externalDependencies are satisfied by querying
 * each foreign app's automaker API. The actual HTTP transport is injected via
 * ForeignFeatureFetcher so this module stays free of network dependencies.
 */

import type { ExternalDependency, ExternalDependencyStatus } from '@protolabsai/types';

/**
 * Result returned by a foreign-app feature query.
 * null means the feature was not found or the app was unreachable.
 */
export interface ForeignFeatureResult {
  /** Normalised feature status from the foreign app */
  status: string;
}

/**
 * Injectable async function that fetches a single feature from a foreign app.
 *
 * Implementations typically call `GET /api/features/get` on the foreign app's
 * automaker server, passing `projectPath` and `featureId`.
 *
 * @returns ForeignFeatureResult on success, null on 404 / unreachable.
 * @throws Should throw with `code: 'ECONNREFUSED' | 'ETIMEDOUT'` for network errors.
 */
export type ForeignFeatureFetcher = (
  appPath: string,
  featureId: string
) => Promise<ForeignFeatureResult | null>;

/**
 * Result of evaluating a single external dependency.
 */
export interface ExternalDepCheckResult {
  dep: ExternalDependency;
  /** Newly-computed status after checking the foreign app */
  resolvedStatus: ExternalDependencyStatus;
  /** Human-readable reason when not satisfied */
  reason?: string;
}

/**
 * Overall result of evaluating all external dependencies for a feature.
 */
export interface ExternalDepsCheckResult {
  /** True only when ALL external dependencies are satisfied */
  satisfied: boolean;
  /** Per-dependency evaluation results */
  results: ExternalDepCheckResult[];
  /** The first unsatisfied dependency description (for statusChangeReason) */
  firstBlockingReason: string | null;
}

/**
 * Checks whether all external dependencies on a feature are satisfied.
 *
 * For each entry in `externalDependencies`:
 * - If the foreign feature is in 'done', 'review', 'completed', or 'verified' → satisfied
 * - If the foreign app returns 404 → broken
 * - If the foreign app is unreachable (network error) → broken
 * - Otherwise → pending
 *
 * @param externalDependencies - Array from Feature.externalDependencies
 * @param fetchForeignFeature - Injected HTTP transport
 * @returns Satisfaction result with per-dep breakdown
 */
export async function checkExternalDependencies(
  externalDependencies: ExternalDependency[],
  fetchForeignFeature: ForeignFeatureFetcher
): Promise<ExternalDepsCheckResult> {
  if (!externalDependencies || externalDependencies.length === 0) {
    return { satisfied: true, results: [], firstBlockingReason: null };
  }

  const results: ExternalDepCheckResult[] = await Promise.all(
    externalDependencies.map(async (dep): Promise<ExternalDepCheckResult> => {
      try {
        const foreign = await fetchForeignFeature(dep.appPath, dep.featureId);

        if (!foreign) {
          return {
            dep,
            resolvedStatus: 'broken',
            reason: `target feature ${dep.featureId} not found in ${dep.appPath}`,
          };
        }

        const satisfiedStatuses = new Set(['done', 'completed', 'verified', 'review']);
        if (satisfiedStatuses.has(foreign.status)) {
          return { dep, resolvedStatus: 'satisfied' };
        }

        return {
          dep,
          resolvedStatus: 'pending',
          reason: `foreign feature ${dep.featureId} is ${foreign.status} (need done/review)`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          dep,
          resolvedStatus: 'broken',
          reason: `could not reach ${dep.appPath}: ${message}`,
        };
      }
    })
  );

  const unsatisfied = results.filter((r) => r.resolvedStatus !== 'satisfied');
  const firstBlockingReason = unsatisfied[0]
    ? `cross-repo dependency: ${unsatisfied[0].dep.description} [${unsatisfied[0].reason ?? unsatisfied[0].resolvedStatus}]`
    : null;

  return {
    satisfied: unsatisfied.length === 0,
    results,
    firstBlockingReason,
  };
}

/**
 * Builds a ForeignFeatureFetcher that calls the local automaker API server.
 *
 * Assumes all foreign apps are served by the same automaker instance
 * (multi-project setup). For cross-instance scenarios the caller should
 * provide a custom fetcher.
 *
 * @param baseUrl - Base URL of the automaker API (e.g. "http://localhost:3008")
 * @param apiKey  - API key for authentication
 */
export function buildLocalForeignFeatureFetcher(
  baseUrl: string,
  apiKey: string
): ForeignFeatureFetcher {
  return async (appPath: string, featureId: string): Promise<ForeignFeatureResult | null> => {
    const url = `${baseUrl}/api/features/get`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ projectPath: appPath, featureId }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 404) return null;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }

    const data = (await response.json()) as {
      success?: boolean;
      feature?: { status?: string };
    };

    if (!data?.feature) return null;

    return { status: data.feature.status ?? 'unknown' };
  };
}
