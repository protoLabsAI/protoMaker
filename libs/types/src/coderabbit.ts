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

/**
 * Review thread feedback status
 */
export type ReviewThreadStatus = 'pending' | 'accepted' | 'denied';

/**
 * Individual review thread with agent decision tracking
 */
export interface ReviewThreadFeedback {
  threadId: string;
  status: ReviewThreadStatus;
  agentReasoning?: string;
  resolvedAt?: string;
}

/**
 * Decision from the evaluate_feedback_thread tool call
 * Captures the agent's evaluation of a single PR feedback thread
 */
export interface FeedbackThreadDecision {
  /** The review thread ID */
  threadId: string;
  /** Whether to accept and fix, or deny with reason */
  decision: 'accept' | 'deny';
  /** Why the agent accepts or denies this feedback */
  reasoning: string;
  /** If accepted, what fix the agent plans to implement */
  plannedFix?: string;
}

/**
 * Pending feedback that arrived while remediation was in progress
 * Queued for processing when current remediation completes
 */
export interface PendingFeedback {
  /** When this feedback was queued */
  queuedAt: string;
  /** The PR iteration count when this feedback arrived */
  iterationCount: number;
  /** The structured feedback items waiting to be processed */
  threads: Array<{
    threadId: string;
    severity: 'critical' | 'warning' | 'suggestion' | 'info';
    message: string;
    location?: {
      path: string;
      line?: number;
    };
    suggestedFix?: string;
    isBot: boolean;
  }>;
}
