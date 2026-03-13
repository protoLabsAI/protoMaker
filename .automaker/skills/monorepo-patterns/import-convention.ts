/**
 * Typed examples of correct import conventions for the Automaker monorepo.
 * See imports.md for the full skill documentation.
 */

// Types from the shared types package — always use @protolabsai/* workspace paths
import type { Feature, FeatureStatus } from '@protolabsai/types';

/**
 * Returns the display title for a feature, falling back to its id.
 * Demonstrates: import type from @protolabsai/types (correct pattern).
 */
export function getFeatureTitle(feature: Feature): string {
  return feature.title ?? feature.id;
}

/**
 * Returns whether a feature status represents active work.
 * Demonstrates: using FeatureStatus from @protolabsai/types.
 */
export function isActiveStatus(status: FeatureStatus): boolean {
  return status === 'in_progress';
}

/**
 * Groups features by their canonical status, skipping features with no status set.
 * Demonstrates: composing types from @protolabsai/types in application logic.
 */
export function groupByStatus(features: Feature[]): Map<FeatureStatus, Feature[]> {
  const groups = new Map<FeatureStatus, Feature[]>();
  for (const feature of features) {
    const status = feature.status as FeatureStatus | undefined;
    if (status === undefined) continue;
    const existing = groups.get(status) ?? [];
    existing.push(feature);
    groups.set(status, existing);
  }
  return groups;
}
