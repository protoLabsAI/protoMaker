/**
 * CodeRabbit Review Types
 *
 * Types for parsing and processing CodeRabbit PR review feedback
 */

/**
 * Severity level of a CodeRabbit suggestion
 */
export type CodeRabbitSeverity = 'critical' | 'warning' | 'suggestion' | 'info';

/**
 * Category of the suggestion
 */
export type CodeRabbitCategory =
  | 'security'
  | 'performance'
  | 'maintainability'
  | 'style'
  | 'best-practice'
  | 'bug'
  | 'documentation'
  | 'testing'
  | 'other';

/**
 * A single file-level comment from CodeRabbit
 */
export interface CodeRabbitFileComment {
  /** File path relative to repo root */
  filePath: string;

  /** Line number(s) the comment refers to */
  lineNumber?: number;
  lineRange?: { start: number; end: number };

  /** Original code snippet being reviewed */
  originalCode?: string;

  /** Suggested code replacement */
  suggestedCode?: string;

  /** Comment text/description */
  comment: string;

  /** Severity level */
  severity: CodeRabbitSeverity;

  /** Category of suggestion */
  category: CodeRabbitCategory;

  /** Whether this is actionable (requires code change) */
  actionable: boolean;
}

/**
 * Summary statistics from CodeRabbit review
 */
export interface CodeRabbitSummary {
  /** Total number of files reviewed */
  filesReviewed: number;

  /** Total lines changed */
  linesChanged: number;

  /** Number of critical issues */
  criticalCount: number;

  /** Number of warnings */
  warningCount: number;

  /** Number of suggestions */
  suggestionCount: number;

  /** Overall assessment */
  overallAssessment?: string;
}

/**
 * Complete CodeRabbit review result
 */
export interface CodeRabbitReview {
  /** Summary statistics */
  summary: CodeRabbitSummary;

  /** File-level comments */
  comments: CodeRabbitFileComment[];

  /** Raw markdown content (for reference) */
  rawContent: string;

  /** Timestamp when parsed */
  parsedAt: string;
}

/**
 * Options for parsing CodeRabbit comments
 */
export interface CodeRabbitParseOptions {
  /** Whether to filter out non-actionable comments */
  actionableOnly?: boolean;

  /** Minimum severity level to include */
  minSeverity?: CodeRabbitSeverity;

  /** Categories to include (undefined = all) */
  categories?: CodeRabbitCategory[];
}
