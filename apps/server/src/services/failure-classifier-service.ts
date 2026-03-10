/**
 * Failure Classifier Service - Pattern-based failure analysis
 *
 * Classifies escalation reasons into structured FailureAnalysis objects
 * using pattern matching on common failure signatures. Pure functions only,
 * no LLM calls, no async operations.
 */

import type { FailureAnalysis, FailureCategory, RecoveryStrategy } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('FailureClassifier');

/**
 * Pattern definition for failure classification
 */
interface FailurePattern {
  /** Regex patterns to match against the error reason */
  patterns: RegExp[];
  /** The failure category this pattern maps to */
  category: FailureCategory;
  /** Whether this failure type is retryable */
  isRetryable: boolean;
  /** Suggested delay before retry in ms */
  suggestedDelay: number;
  /** Maximum retries for this failure type */
  maxRetries: number;
  /** Factory function to create recovery strategy */
  createRecoveryStrategy: (reason: string) => RecoveryStrategy;
  /** Context keys to preserve for retry */
  contextToPreserve: string[];
  /** Human-readable explanation */
  explanation: string;
  /** Match confidence (0-1) when pattern matches */
  confidence: number;
}

/**
 * Ordered list of failure patterns - first match wins
 */
const FAILURE_PATTERNS: FailurePattern[] = [
  // Rate limit errors
  {
    patterns: [
      /rate.?limit/i,
      /too many requests/i,
      /429/i,
      /throttl/i,
      /quota exceeded/i,
      /api.?limit/i,
    ],
    category: 'rate_limit',
    isRetryable: true,
    suggestedDelay: 60000, // 1 minute
    maxRetries: 5,
    createRecoveryStrategy: () => ({
      type: 'pause_and_wait',
      duration: 60000,
      reason: 'API rate limit reached, waiting for quota reset',
    }),
    contextToPreserve: ['lastApiCall', 'requestCount'],
    explanation: 'API rate limit exceeded - exponential backoff required',
    confidence: 0.95,
  },

  // Timeout errors
  {
    patterns: [
      /timeout/i,
      /timed? ?out/i,
      /ETIMEDOUT/i,
      /ESOCKETTIMEDOUT/i,
      /deadline exceeded/i,
      /execution.+exceeded/i,
      /took too long/i,
    ],
    category: 'transient',
    isRetryable: true,
    suggestedDelay: 5000,
    maxRetries: 3,
    createRecoveryStrategy: () => ({
      type: 'retry',
      delay: 5000,
    }),
    contextToPreserve: ['lastOperation', 'progress'],
    explanation: 'Operation timed out - likely a transient network or server issue',
    confidence: 0.9,
  },

  // Merge conflict errors
  {
    patterns: [
      /merge conflict/i,
      /CONFLICT.*Merge/i,
      /cannot merge/i,
      /conflict in.*file/i,
      /unmerged files/i,
      /fix conflicts/i,
      /rebase.*conflict/i,
    ],
    category: 'merge_conflict',
    isRetryable: true,
    suggestedDelay: 5000,
    maxRetries: 1,
    createRecoveryStrategy: () => ({
      type: 'retry_with_context',
      context:
        'A git merge conflict was detected. Before retrying, rebase your branch onto the latest main: ' +
        '`git fetch origin && git rebase origin/main`. ' +
        'If conflicts appear, resolve them then run `git rebase --continue`. ' +
        'After a clean rebase, push with `git push --force-with-lease`.',
      delay: 5000,
    }),
    contextToPreserve: ['conflictingFiles', 'branchName', 'baseBranch'],
    explanation:
      'Git merge conflict detected - rebasing onto latest main may resolve this automatically',
    confidence: 0.95,
  },

  // Test failure errors
  {
    patterns: [
      /test(s)? fail/i,
      /test(s)? error/i,
      /\d+ (test(s)?|spec(s)?) failed/i,
      /jest.*fail/i,
      /vitest.*fail/i,
      /playwright.*fail/i,
      /assertion.*fail/i,
      /expect.*received/i,
      /FAIL\s+.*\.test\./i,
      /npm test.*exit code/i,
    ],
    category: 'test_failure',
    isRetryable: true,
    suggestedDelay: 2000,
    maxRetries: 2,
    createRecoveryStrategy: () => ({
      type: 'retry_with_context',
      context: 'Previous test failure - review test output and fix failing assertions',
      delay: 2000,
    }),
    contextToPreserve: ['failingTests', 'testOutput', 'lastChanges'],
    explanation: 'Tests failed - retry with fixes based on test output',
    confidence: 0.9,
  },

  // Build/compile errors (TypeScript, webpack, etc.)
  {
    patterns: [
      /build fail/i,
      /compilation fail/i,
      /compile error/i,
      /typescript error/i,
      /TS\d{4}:/i, // TypeScript error codes like TS2345
      /tsc.*error/i,
      /webpack.*error/i,
      /vite.*error/i,
      /esbuild.*error/i,
      /npm run build.*exit code/i,
      /cannot find module/i,
      /module not found/i,
    ],
    category: 'tool_error',
    isRetryable: true,
    suggestedDelay: 1000,
    maxRetries: 2,
    createRecoveryStrategy: () => ({
      type: 'retry_with_context',
      context:
        'Build failed - run `npm run build:packages` first (shared types), then `npm run build:server`. Read the FULL compiler output and fix ALL errors before retrying. Use `npm run typecheck` to find all type errors at once.',
      delay: 1000,
    }),
    contextToPreserve: ['buildOutput', 'errorFiles', 'lastChanges'],
    explanation: 'Build/compilation error - fix source code issues',
    confidence: 0.85,
  },

  // Type errors (subset of build errors, more specific)
  {
    patterns: [
      /type error/i,
      /type '.*' is not assignable/i,
      /property '.*' does not exist/i,
      /argument of type/i,
      /expected \d+ arguments/i,
      /cannot read propert/i,
      /undefined is not/i,
      /null is not/i,
    ],
    category: 'tool_error',
    isRetryable: true,
    suggestedDelay: 1000,
    maxRetries: 2,
    createRecoveryStrategy: () => ({
      type: 'retry_with_context',
      context:
        'TypeScript type error - run `npm run typecheck` to see ALL errors at once. Fix each one: update type definitions, correct interface shapes, and update all consumers. Never use `as any` or `// @ts-ignore`.',
      delay: 1000,
    }),
    contextToPreserve: ['typeErrors', 'affectedFiles'],
    explanation: 'TypeScript type error - fix type mismatches',
    confidence: 0.85,
  },

  // Dependency errors
  {
    patterns: [
      /dependency.*(missing|not found|error)/i,
      /cannot find (package|module)/i,
      /ENOENT.*node_modules/i,
      /npm (install|ci).*fail/i,
      /package.*not found/i,
      /peer dependency/i,
      /resolution fail/i,
      /npm ERR!/i,
      /ERESOLVE/i,
    ],
    category: 'dependency',
    isRetryable: true,
    suggestedDelay: 3000,
    maxRetries: 2,
    createRecoveryStrategy: () => ({
      type: 'alternative_approach',
      suggestion: 'Run npm install to restore dependencies, then retry',
    }),
    contextToPreserve: ['missingPackages', 'packageJson'],
    explanation: 'Dependency resolution error - may need npm install',
    confidence: 0.85,
  },

  // Authentication errors
  {
    patterns: [
      /auth(entication)? (fail|error)/i,
      /unauthorized/i,
      /401/i,
      /403/i,
      /forbidden/i,
      /invalid.*token/i,
      /expired.*token/i,
      /credentials/i,
      /permission denied/i,
      /access denied/i,
    ],
    category: 'authentication',
    isRetryable: false,
    suggestedDelay: 0,
    maxRetries: 0,
    createRecoveryStrategy: (reason) => ({
      type: 'escalate_to_user',
      reason: `Authentication error - credentials may need refresh: ${reason.slice(0, 200)}`,
    }),
    contextToPreserve: ['service', 'endpoint'],
    explanation: 'Authentication/authorization error - credentials need attention',
    confidence: 0.9,
  },

  // Quota errors (distinct from rate limit)
  {
    patterns: [/quota/i, /usage limit/i, /billing/i, /credit/i, /exceeded.*limit/i, /capacity/i],
    category: 'quota',
    isRetryable: false,
    suggestedDelay: 0,
    maxRetries: 0,
    createRecoveryStrategy: (reason) => ({
      type: 'escalate_to_user',
      reason: `Usage quota exceeded - may need billing review: ${reason.slice(0, 200)}`,
    }),
    contextToPreserve: ['service', 'usageStats'],
    explanation: 'Usage quota exceeded - requires account/billing attention',
    confidence: 0.85,
  },

  // Validation errors
  {
    patterns: [
      /validation (fail|error)/i,
      /invalid (input|parameter|argument)/i,
      /schema.*error/i,
      /required.*missing/i,
      /malformed/i,
    ],
    category: 'validation',
    isRetryable: false,
    suggestedDelay: 0,
    maxRetries: 0,
    createRecoveryStrategy: (reason) => ({
      type: 'escalate_to_user',
      reason: `Validation error - input needs correction: ${reason.slice(0, 200)}`,
    }),
    contextToPreserve: ['validationErrors', 'input'],
    explanation: 'Input validation failed - needs human review of inputs',
    confidence: 0.8,
  },

  // Git hook / pre-commit / lint failures
  {
    patterns: [
      /git.*hook.*fail/i,
      /pre-commit.*fail/i,
      /commit.*hook.*fail/i,
      /lint-staged.*fail/i,
      /prettier.*fail/i,
      /eslint.*fail/i,
      /hook.*exit.*code/i,
      /husky.*fail/i,
      /commit.*attempt/i,
    ],
    category: 'tool_error',
    isRetryable: true,
    suggestedDelay: 2000,
    maxRetries: 2,
    createRecoveryStrategy: () => ({
      type: 'retry_with_context',
      context:
        'Git hook / lint failure - run `npm run format` to auto-fix Prettier, then `npm run lint` for ESLint errors. Stage the formatted files and retry the commit. If hooks are missing, run `npm install` in the worktree first.',
      delay: 2000,
    }),
    contextToPreserve: ['hookOutput', 'lastChanges', 'affectedFiles'],
    explanation: 'Git hook or pre-commit check failed - fix linting/formatting issues',
    confidence: 0.9,
  },

  // Agent escalation — needs human input / clarification
  {
    patterns: [
      /could not determine/i,
      /needs? (human|user|manual) (input|review|intervention|clarification)/i,
      /waiting for.*(input|clarification|design|decision|approval)/i,
      /blocked.*pending/i,
      /requires? clarification/i,
      /unclear requirements?/i,
      /ambiguous/i,
      /no (clear )?next step/i,
      /cannot proceed without/i,
      /insufficient (context|information|details?)/i,
    ],
    category: 'validation',
    isRetryable: false,
    suggestedDelay: 0,
    maxRetries: 0,
    createRecoveryStrategy: (reason) => ({
      type: 'escalate_to_user',
      reason: `Agent needs human input to proceed: ${reason.slice(0, 200)}`,
    }),
    contextToPreserve: ['agentOutput', 'lastQuestion', 'blockedOn'],
    explanation: 'Agent escalation — needs human input or clarification to proceed',
    confidence: 0.75,
  },

  // Network/transient errors (catch-all for network issues)
  {
    patterns: [
      /network error/i,
      /ECONNREFUSED/i,
      /ECONNRESET/i,
      /ENOTFOUND/i,
      /socket hang up/i,
      /connection (fail|reset|refused)/i,
      /fetch fail/i,
      /request fail/i,
    ],
    category: 'transient',
    isRetryable: true,
    suggestedDelay: 3000,
    maxRetries: 3,
    createRecoveryStrategy: () => ({
      type: 'retry',
      delay: 3000,
    }),
    contextToPreserve: ['lastRequest', 'endpoint'],
    explanation: 'Network error - likely transient, retry with backoff',
    confidence: 0.8,
  },
];

/**
 * Default analysis for unknown failures
 */
function createUnknownAnalysis(reason: string): FailureAnalysis {
  return {
    category: 'unknown',
    isRetryable: false,
    suggestedDelay: 0,
    maxRetries: 0,
    recoveryStrategy: {
      type: 'escalate_to_user',
      reason: `Unclassified failure - needs investigation: ${reason.slice(0, 300)}`,
    },
    contextToPreserve: ['fullErrorLog', 'agentOutput'],
    explanation: 'Unknown failure type - requires manual investigation',
    originalError: reason,
    currentRetryCount: 0,
  };
}

/**
 * Classification result with confidence score
 */
export interface ClassificationResult extends FailureAnalysis {
  /** Confidence score (0-1) for the classification */
  confidence: number;
}

/**
 * Failure Classifier Service
 *
 * Classifies error messages into structured failure analyses using
 * pattern matching. All methods are synchronous pure functions.
 */
export class FailureClassifierService {
  /**
   * Classify an escalation reason string into a structured FailureAnalysis
   *
   * @param reason - The error/escalation reason string to classify
   * @param currentRetryCount - Current retry count (default 0)
   * @returns ClassificationResult with category, recovery strategy, and confidence
   */
  classify(reason: string, currentRetryCount = 0): ClassificationResult {
    if (!reason || typeof reason !== 'string') {
      logger.warn('Empty or invalid reason provided to classify');
      return {
        ...createUnknownAnalysis(reason || ''),
        confidence: 0,
      };
    }

    // Try to match patterns in order
    for (const pattern of FAILURE_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(reason)) {
          logger.debug(`Classified failure as ${pattern.category}`, {
            pattern: regex.toString(),
            confidence: pattern.confidence,
          });

          return {
            category: pattern.category,
            isRetryable: pattern.isRetryable,
            suggestedDelay: pattern.suggestedDelay,
            maxRetries: pattern.maxRetries,
            recoveryStrategy: pattern.createRecoveryStrategy(reason),
            contextToPreserve: pattern.contextToPreserve,
            explanation: pattern.explanation,
            originalError: reason,
            currentRetryCount,
            confidence: pattern.confidence,
          };
        }
      }
    }

    // No pattern matched - return unknown
    // Warn so unclassified failure reasons are visible in production logs.
    // If this pattern is common, add a new entry to FAILURE_PATTERNS above.
    logger.warn('No pattern matched, classifying as unknown', {
      reasonSnippet: reason.slice(0, 200),
    });
    return {
      ...createUnknownAnalysis(reason),
      confidence: 0.5, // Low confidence for unknown
    };
  }

  /**
   * Check if a failure category is retryable
   */
  isRetryable(category: FailureCategory): boolean {
    const retryableCategories: FailureCategory[] = [
      'transient',
      'rate_limit',
      'test_failure',
      'tool_error',
      'dependency',
    ];
    return retryableCategories.includes(category);
  }

  /**
   * Get recommended delay for a failure category
   */
  getRecommendedDelay(category: FailureCategory, retryCount: number): number {
    const baseDelays: Record<FailureCategory, number> = {
      transient: 3000,
      rate_limit: 60000,
      quota: 0,
      validation: 0,
      tool_error: 1000,
      test_failure: 2000,
      merge_conflict: 0,
      dependency: 3000,
      authentication: 0,
      retry_exhausted: 0,
      unknown: 0,
    };

    const baseDelay = baseDelays[category];
    if (baseDelay === 0) return 0;

    // Exponential backoff: base * 2^retryCount, capped at 5 minutes
    return Math.min(baseDelay * Math.pow(2, retryCount), 300000);
  }

  /**
   * Batch classify multiple reasons
   */
  classifyBatch(reasons: string[]): ClassificationResult[] {
    return reasons.map((reason) => this.classify(reason));
  }

  /**
   * Get summary statistics for a batch of classifications
   */
  getClassificationStats(results: ClassificationResult[]): Record<FailureCategory, number> {
    const stats: Record<FailureCategory, number> = {
      transient: 0,
      rate_limit: 0,
      quota: 0,
      validation: 0,
      tool_error: 0,
      test_failure: 0,
      merge_conflict: 0,
      dependency: 0,
      authentication: 0,
      retry_exhausted: 0,
      unknown: 0,
    };

    for (const result of results) {
      stats[result.category]++;
    }

    return stats;
  }
}

/**
 * Create a new FailureClassifierService instance
 */
export function createFailureClassifierService(): FailureClassifierService {
  return new FailureClassifierService();
}
