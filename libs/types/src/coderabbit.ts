/**
 * CodeRabbit feedback and review types
 */

/**
 * CodeRabbit review comment location
 */
export interface CodeRabbitCommentLocation {
  path: string;
  line?: number;
  startLine?: number;
  endLine?: number;
}

/**
 * CodeRabbit review comment severity
 */
export type CodeRabbitSeverity = 'critical' | 'warning' | 'suggestion' | 'info';

/**
 * Individual CodeRabbit review comment
 */
export interface CodeRabbitComment {
  id: string;
  severity: CodeRabbitSeverity;
  message: string;
  location?: CodeRabbitCommentLocation;
  suggestion?: string;
  category?: string;
  createdAt: string;
}

/**
 * CodeRabbit PR review summary
 */
export interface CodeRabbitReview {
  prNumber: number;
  prUrl: string;
  reviewedAt: string;
  comments: CodeRabbitComment[];
  summary?: string;
  overallRating?: 'approved' | 'changes_requested' | 'commented';
}

/**
 * Feature linked to a PR/branch
 */
export interface FeatureBranchLink {
  featureId: string;
  branchName: string;
  prNumber?: number;
  prUrl?: string;
  linkedAt: string;
}

/**
 * CodeRabbit feedback mapped to feature
 */
export interface FeatureCodeRabbitFeedback {
  featureId: string;
  branchName: string;
  review: CodeRabbitReview;
  processedAt: string;
}

/**
 * Parse result from CodeRabbit comment parser
 */
export interface CodeRabbitParseResult {
  success: boolean;
  review?: CodeRabbitReview;
  error?: string;
}
