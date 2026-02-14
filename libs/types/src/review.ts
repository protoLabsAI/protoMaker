/**
 * Antagonistic Review Pipeline types
 * Defines the dual-perspective review system for milestone deliverables
 */

/**
 * Verdict for a review section
 * - approve: Section meets quality standards
 * - concern: Issues noted but not blocking
 * - block: Critical issues that prevent approval
 */
export type ReviewVerdict = 'approve' | 'concern' | 'block';

/**
 * A single reviewer's perspective on a section
 */
export interface SectionReview {
  /** Section identifier (e.g., 'implementation', 'testing', 'documentation') */
  section: string;
  /** Verdict for this section */
  verdict: ReviewVerdict;
  /** Detailed comments and reasoning */
  comments: string;
  /** Specific issues or concerns identified */
  issues?: string[];
  /** Suggestions for improvement */
  suggestions?: string[];
}

/**
 * Single reviewer's complete perspective
 */
export interface ReviewerPerspective {
  /** Reviewer identifier ('ava' or 'jon') */
  reviewer: 'ava' | 'jon';
  /** Overall verdict for the milestone */
  overallVerdict: ReviewVerdict;
  /** Reviews for each section */
  sections: SectionReview[];
  /** General comments not specific to a section */
  generalComments?: string;
  /** ISO 8601 timestamp when review was completed */
  completedAt: string;
}

/**
 * The complete antagonistic review result with both perspectives
 */
export interface AntagonisticReviewResult {
  /** Ava's perspective (optimistic, supportive) */
  ava: ReviewerPerspective;
  /** Jon's perspective (critical, rigorous) */
  jon: ReviewerPerspective;
  /** Consolidated verdict after resolution */
  consolidatedVerdict?: ReviewVerdict;
  /** Final consensus comments after resolution */
  consensusComments?: string;
  /** Current state in the review workflow */
  state: ReviewState;
  /** ISO 8601 timestamp when review was initiated */
  startedAt: string;
  /** ISO 8601 timestamp when review was completed and consolidated */
  completedAt?: string;
}

/**
 * Review state machine
 * Tracks the current phase of the antagonistic review process
 */
export type ReviewState =
  | 'draft'           // Milestone deliverable being prepared
  | 'ava_review'      // Ava conducting her review
  | 'jon_review'      // Jon conducting his review
  | 'resolution'      // Resolving disagreements between perspectives
  | 'consolidated';   // Final verdict reached, review complete

/**
 * Content brief for milestone delivery
 * Defines what should be included in a milestone deliverable package
 */
export interface ContentBrief {
  /** Milestone identifier */
  milestoneId: string;
  /** Expected deliverable types */
  deliverableTypes: DeliverableType[];
  /** Required documentation sections */
  requiredSections: string[];
  /** Quality criteria to assess */
  qualityCriteria: string[];
  /** ISO 8601 timestamp when brief was created */
  createdAt: string;
}

/**
 * Types of deliverables expected in a milestone
 */
export type DeliverableType =
  | 'code'            // Implementation artifacts
  | 'tests'           // Test suites and coverage
  | 'documentation'   // Technical documentation
  | 'architecture'    // Architecture diagrams and decisions
  | 'demo'            // Demo or showcase materials
  | 'migration';      // Migration guides or scripts
