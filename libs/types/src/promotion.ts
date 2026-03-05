/**
 * Promotion types for feature promotion pipeline tracking
 *
 * These types support the Detection & Candidate Tracking milestone,
 * enabling features to be tracked from dev merge through staging/main promotion.
 */

/**
 * Status of a promotion candidate or batch in the promotion pipeline.
 * - candidate: Feature has been merged to dev and is eligible for promotion
 * - selected: Feature has been selected for inclusion in a promotion batch
 * - promoted: Feature has been successfully promoted to main
 * - held: Feature promotion is intentionally deferred
 * - rejected: Feature has been rejected from the promotion batch
 */
export type PromotionStatus = 'candidate' | 'selected' | 'promoted' | 'held' | 'rejected';

/**
 * Represents a single feature that is a candidate for promotion to staging/production.
 * Created when a feature branch is merged to the dev branch.
 */
export interface PromotionCandidate {
  /** ID of the feature being promoted */
  featureId: string;
  /** Human-readable title of the feature */
  featureTitle: string;
  /** Name of the feature branch that was merged */
  branchName: string;
  /** Git commit SHA of the merge commit on dev */
  commitSha: string;
  /** ISO 8601 timestamp when the feature was merged to dev */
  mergedAt: string;
  /** Current status of this candidate in the promotion pipeline */
  status: PromotionStatus;
}

/**
 * A batch of promotion candidates being promoted together as a single release unit.
 * A batch groups multiple candidates and tracks the full lifecycle from
 * branch creation through staging PR and final main PR.
 */
export interface PromotionBatch {
  /** Unique identifier for this promotion batch */
  batchId: string;
  /** List of promotion candidates included in this batch */
  candidates: PromotionCandidate[];
  /** Name of the promotion branch created for this batch (e.g., "release-2024-01-15") */
  promotionBranchName: string;
  /** URL of the staging PR (dev → staging), set when the staging PR is created */
  stagingPrUrl?: string;
  /** URL of the main PR (staging → main), set when the main PR is created */
  mainPrUrl?: string;
  /** Current status of this batch */
  status: PromotionStatus;
  /** ISO 8601 timestamp when this batch was created */
  createdAt: string;
}

/**
 * Promotion configuration stored in GlobalSettings.
 * Controls how the promotion pipeline detects and tracks candidates.
 */
export interface PromotionConfig {
  /** Prefix used when naming promotion batches (e.g., "release-", "promo-") */
  batchPrefix?: string;
  /** When true, automatically create a promotion candidate when a feature is merged to dev */
  autoCandidateOnDevMerge?: boolean;
}
