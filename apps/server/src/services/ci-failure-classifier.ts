/**
 * CIFailureClassifierService - Pattern-based CI check name classifier
 *
 * Classifies GitHub check run names into CIFailureClass categories using
 * regex pattern matching. Default patterns cover common CI check names.
 * Project-level overrides via workflowSettings.ciClassification merge with defaults.
 *
 * Pure service — no side effects, no API calls, no async operations.
 */

import { createLogger } from '@protolabsai/utils';

const logger = createLogger('CIFailureClassifier');

// ============================================================================
// Types
// ============================================================================

/**
 * Categories of CI check failures.
 * Each value represents a distinct class of CI failure type.
 */
export type CIFailureClass =
  | 'lint' // ESLint, Biome, or similar linting checks
  | 'format' // Prettier, dprint, or formatting checks
  | 'typecheck' // TypeScript type checking (tsc --noEmit)
  | 'test' // Unit, integration, or e2e tests
  | 'build' // Compilation, bundling, or build steps
  | 'audit' // Security audits (npm audit, Snyk, etc.)
  | 'deploy' // Deployment or environment provisioning checks
  | 'coderabbit' // CodeRabbit AI code review
  | 'unknown'; // Could not classify — fallback

/**
 * Result of classifying a single CI check run.
 */
export interface ClassifiedCIFailure {
  /** The original check name as reported by GitHub */
  checkName: string;
  /** The classified failure class */
  failureClass: CIFailureClass;
  /** Confidence score (0-1). 1.0 for exact/high-confidence matches, lower for fuzzy. */
  confidence: number;
  /** The regex pattern string that matched, or null if classified as unknown */
  matchedPattern: string | null;
}

/**
 * Per-class pattern override configuration.
 * Maps CIFailureClass to an array of regex pattern strings.
 * These are merged with (and take precedence over) the default patterns.
 */
export type CIClassificationConfig = Partial<Record<CIFailureClass, string[]>>;

// ============================================================================
// Default Patterns
// ============================================================================

/**
 * Pattern definition for CI failure classification.
 */
interface CIClassPattern {
  /** The class this pattern maps to */
  failureClass: CIFailureClass;
  /** Regex patterns to match against check names */
  patterns: RegExp[];
  /** Confidence score for this class's patterns */
  confidence: number;
}

/**
 * Default hardcoded patterns for common CI check names.
 * Patterns are matched in order; first match wins.
 * All patterns are case-insensitive.
 */
const DEFAULT_PATTERNS: CIClassPattern[] = [
  // CodeRabbit — check first since "coderabbit" is very specific
  {
    failureClass: 'coderabbit',
    patterns: [/coderabbit/i, /code[-_]?rabbit/i],
    confidence: 1.0,
  },

  // Lint
  {
    failureClass: 'lint',
    patterns: [
      /\blint\b/i,
      /eslint/i,
      /biome/i,
      /stylelint/i,
      /oxlint/i,
      /\bcheck[_-]?lint\b/i,
    ],
    confidence: 0.95,
  },

  // Format
  {
    failureClass: 'format',
    patterns: [
      /\bformat\b/i,
      /prettier/i,
      /dprint/i,
      /\bcheck[_-]?format\b/i,
      /format[_-]?check/i,
    ],
    confidence: 0.95,
  },

  // Typecheck
  {
    failureClass: 'typecheck',
    patterns: [
      /\btypecheck\b/i,
      /\btype[_-]?check\b/i,
      /\btsc\b/i,
      /typescript[_-]?check/i,
      /type[_-]?errors?/i,
    ],
    confidence: 0.95,
  },

  // Audit / Security
  {
    failureClass: 'audit',
    patterns: [
      /\baudit\b/i,
      /\bsecurity[_-]?scan\b/i,
      /\bsnyk\b/i,
      /\bdependabot\b/i,
      /\bvuln/i,
      /\bsast\b/i,
      /\bdast\b/i,
      /npm[_-]?audit/i,
      /license[_-]?check/i,
    ],
    confidence: 0.95,
  },

  // Tests — after lint/format/typecheck so "build-test" doesn't collide with build
  {
    failureClass: 'test',
    patterns: [
      /\btest(s)?\b/i,
      /\bspec(s)?\b/i,
      /\bjest\b/i,
      /\bvitest\b/i,
      /\bplaywright\b/i,
      /\bcypress\b/i,
      /\bmocha\b/i,
      /\bcoverage\b/i,
      /\be2e\b/i,
      /\bend[_-]?to[_-]?end\b/i,
      /\bunit\b/i,
      /\bintegration[_-]?test/i,
    ],
    confidence: 0.9,
  },

  // Build — after test to avoid matching "build-test" as build prematurely (test patterns above catch that case)
  {
    failureClass: 'build',
    patterns: [
      /\bbuild\b/i,
      /\bcompile\b/i,
      /\bbundl/i,
      /\bwebpack\b/i,
      /\bvite\b/i,
      /\besbuild\b/i,
      /\brollup\b/i,
      /\bnext\b.*build/i,
      /build.*\bnext\b/i,
    ],
    confidence: 0.9,
  },

  // Deploy
  {
    failureClass: 'deploy',
    patterns: [
      /\bdeploy\b/i,
      /\brelease\b/i,
      /\bpublish\b/i,
      /\bprovisio/i,
      /\bstaging\b/i,
      /\bproduction\b/i,
      /\bheroku\b/i,
      /\bvercel\b/i,
      /\bnetlify\b/i,
      /\baws[_-]?deploy/i,
      /\becdeploy\b/i,
    ],
    confidence: 0.85,
  },
];

// ============================================================================
// Service
// ============================================================================

/**
 * CIFailureClassifierService
 *
 * Classifies GitHub check run names into CIFailureClass categories.
 * Default patterns are hardcoded; project-level overrides come from
 * workflowSettings.ciClassification (Record<CIFailureClass, string[]>).
 *
 * Usage:
 *   const classifier = new CIFailureClassifierService();
 *   const results = classifier.classify(['build', 'lint', 'my-custom-check'], config);
 */
export class CIFailureClassifierService {
  /**
   * Classify a list of CI check names into ClassifiedCIFailure results.
   *
   * @param checkNames - Check run names (as reported by GitHub) to classify
   * @param overrides  - Optional project-level regex pattern overrides per class
   * @returns ClassifiedCIFailure[] in the same order as the input
   */
  classify(checkNames: string[], overrides?: CIClassificationConfig): ClassifiedCIFailure[] {
    const mergedPatterns = this.buildMergedPatterns(overrides);

    return checkNames.map((checkName) => this.classifySingle(checkName, mergedPatterns));
  }

  /**
   * Classify a single check name. Exposed for unit testing convenience.
   */
  classifySingle(
    checkName: string,
    mergedPatterns?: CIClassPattern[]
  ): ClassifiedCIFailure {
    const patterns = mergedPatterns ?? this.buildMergedPatterns();

    if (!checkName || typeof checkName !== 'string') {
      logger.warn('Empty or invalid check name provided');
      return {
        checkName: checkName ?? '',
        failureClass: 'unknown',
        confidence: 0,
        matchedPattern: null,
      };
    }

    for (const entry of patterns) {
      for (const regex of entry.patterns) {
        if (regex.test(checkName)) {
          logger.debug(`Classified "${checkName}" as ${entry.failureClass}`, {
            pattern: regex.toString(),
            confidence: entry.confidence,
          });

          return {
            checkName,
            failureClass: entry.failureClass,
            confidence: entry.confidence,
            matchedPattern: regex.toString(),
          };
        }
      }
    }

    logger.debug(`No pattern matched for "${checkName}", classifying as unknown`);

    return {
      checkName,
      failureClass: 'unknown',
      confidence: 0.5,
      matchedPattern: null,
    };
  }

  /**
   * Build the merged pattern list by prepending project-level override patterns
   * (higher precedence) before the default patterns.
   */
  private buildMergedPatterns(overrides?: CIClassificationConfig): CIClassPattern[] {
    if (!overrides || Object.keys(overrides).length === 0) {
      return DEFAULT_PATTERNS;
    }

    // Build override entries (project patterns take precedence — prepended)
    const overrideEntries: CIClassPattern[] = [];

    for (const [cls, patternStrings] of Object.entries(overrides) as [
      CIFailureClass,
      string[],
    ][]) {
      if (!Array.isArray(patternStrings) || patternStrings.length === 0) continue;

      const compiled: RegExp[] = [];
      for (const ps of patternStrings) {
        try {
          compiled.push(new RegExp(ps, 'i'));
        } catch (err) {
          logger.warn(`Invalid regex in ciClassification override for class "${cls}": ${ps}`, {
            error: err,
          });
        }
      }

      if (compiled.length > 0) {
        overrideEntries.push({
          failureClass: cls,
          patterns: compiled,
          confidence: 1.0, // Project-defined patterns get full confidence
        });
      }
    }

    return [...overrideEntries, ...DEFAULT_PATTERNS];
  }
}

/**
 * Create a new CIFailureClassifierService instance.
 */
export function createCIFailureClassifierService(): CIFailureClassifierService {
  return new CIFailureClassifierService();
}
