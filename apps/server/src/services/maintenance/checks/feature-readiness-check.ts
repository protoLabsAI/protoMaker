/**
 * FeatureReadinessCheck - Scores backlog features on specification completeness.
 *
 * Evaluates four dimensions:
 * 1. Description quality (length >= 100 chars, contains technical detail)
 * 2. Acceptance criteria presence and count (>= 2 criteria via successCriteria)
 * 3. filesToModify populated
 * 4. Dependency completeness (all referenced feature IDs exist on the board)
 *
 * Features scoring below the configurable threshold (default 60) generate
 * auto-fixable maintenance issues. The auto-fix enriches thin descriptions
 * using an enhancement model with project context.
 */

import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import type { FeatureLoader } from '../../feature-loader.js';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const logger = createLogger('FeatureReadinessCheck');

// ---------------------------------------------------------------------------
// Scoring weights (must sum to 100)
// ---------------------------------------------------------------------------

export interface ReadinessWeights {
  /** Weight for description quality dimension (default: 35) */
  description: number;
  /** Weight for acceptance criteria dimension (default: 25) */
  acceptanceCriteria: number;
  /** Weight for filesToModify dimension (default: 20) */
  filesToModify: number;
  /** Weight for dependency completeness dimension (default: 20) */
  dependencyCompleteness: number;
}

export const DEFAULT_READINESS_WEIGHTS: ReadinessWeights = {
  description: 35,
  acceptanceCriteria: 25,
  filesToModify: 20,
  dependencyCompleteness: 20,
};

/** Minimum description length to receive full marks for the length sub-score. */
const MIN_DESCRIPTION_LENGTH = 100;

/** Minimum number of successCriteria entries for a full acceptance criteria score. */
const MIN_ACCEPTANCE_CRITERIA = 2;

/**
 * Patterns that indicate technical specificity in a description.
 * Matching at least one earns the technical-detail sub-score.
 */
const TECHNICAL_PATTERNS: RegExp[] = [
  /\b(?:api|endpoint|route|service|component|module|function|class|interface|type)\b/i,
  /\b(?:database|schema|migration|query|index|table)\b/i,
  /\b(?:test|spec|coverage|assert|expect|mock)\b/i,
  /\b(?:config|env|setting|flag|threshold)\b/i,
  /\b(?:import|export|dependency|package)\b/i,
  /(?:\.ts|\.js|\.tsx|\.jsx|\.json|\.yaml|\.yml)\b/,
  /\b(?:src\/|libs\/|apps\/)/,
];

// ---------------------------------------------------------------------------
// Dimension scorers
// ---------------------------------------------------------------------------

/** Score description quality: 60% length, 40% technical detail. */
export function scoreDescription(description: string): number {
  if (!description || description.trim().length === 0) return 0;

  const trimmed = description.trim();

  // Length sub-score: linear ramp up to MIN_DESCRIPTION_LENGTH
  const lengthRatio = Math.min(trimmed.length / MIN_DESCRIPTION_LENGTH, 1);
  const lengthScore = lengthRatio * 0.6;

  // Technical detail sub-score: binary — at least one pattern match
  const hasTechnicalDetail = TECHNICAL_PATTERNS.some((p) => p.test(trimmed));
  const technicalScore = hasTechnicalDetail ? 0.4 : 0;

  return lengthScore + technicalScore;
}

/** Score acceptance criteria: ratio of present criteria to MIN_ACCEPTANCE_CRITERIA. */
export function scoreAcceptanceCriteria(successCriteria: string[] | undefined): number {
  if (!successCriteria || successCriteria.length === 0) return 0;

  // Filter out empty strings
  const valid = successCriteria.filter((c) => c.trim().length > 0);
  if (valid.length === 0) return 0;

  return Math.min(valid.length / MIN_ACCEPTANCE_CRITERIA, 1);
}

/** Score filesToModify: 1.0 if at least one path is present, 0 otherwise. */
export function scoreFilesToModify(filesToModify: string[] | undefined): number {
  if (!filesToModify || filesToModify.length === 0) return 0;
  return filesToModify.some((f) => f.trim().length > 0) ? 1 : 0;
}

/** Score dependency completeness: 1.0 if all deps exist (or no deps), 0-1 proportional. */
export function scoreDependencyCompleteness(
  dependencies: string[] | undefined,
  allFeatureIds: Set<string>
): number {
  if (!dependencies || dependencies.length === 0) return 1; // No deps = fully satisfied
  const resolved = dependencies.filter((depId) => allFeatureIds.has(depId));
  return resolved.length / dependencies.length;
}

// ---------------------------------------------------------------------------
// Composite scorer
// ---------------------------------------------------------------------------

export interface ReadinessScoreBreakdown {
  /** Overall score 0-100 */
  total: number;
  /** Per-dimension raw scores (0-1 each) */
  dimensions: {
    description: number;
    acceptanceCriteria: number;
    filesToModify: number;
    dependencyCompleteness: number;
  };
  /** Per-dimension weighted contributions (summing to total) */
  weighted: {
    description: number;
    acceptanceCriteria: number;
    filesToModify: number;
    dependencyCompleteness: number;
  };
}

export function computeReadinessScore(
  feature: Feature,
  allFeatureIds: Set<string>,
  weights: ReadinessWeights = DEFAULT_READINESS_WEIGHTS
): ReadinessScoreBreakdown {
  const dimensions = {
    description: scoreDescription(feature.description),
    acceptanceCriteria: scoreAcceptanceCriteria(feature.successCriteria),
    filesToModify: scoreFilesToModify(feature.filesToModify),
    dependencyCompleteness: scoreDependencyCompleteness(feature.dependencies, allFeatureIds),
  };

  const weighted = {
    description: dimensions.description * weights.description,
    acceptanceCriteria: dimensions.acceptanceCriteria * weights.acceptanceCriteria,
    filesToModify: dimensions.filesToModify * weights.filesToModify,
    dependencyCompleteness: dimensions.dependencyCompleteness * weights.dependencyCompleteness,
  };

  const total = Math.round(
    weighted.description +
      weighted.acceptanceCriteria +
      weighted.filesToModify +
      weighted.dependencyCompleteness
  );

  return { total, dimensions, weighted };
}

// ---------------------------------------------------------------------------
// Enhancement prompt builder (for auto-fix)
// ---------------------------------------------------------------------------

function buildEnrichmentPrompt(feature: Feature, projectContext: string): string {
  const parts: string[] = [
    'You are a technical product manager enriching a feature description.',
    'The current description is too thin for an AI agent to implement confidently.',
    '',
    'Rewrite the description to be specific, actionable, and technically detailed.',
    'Include: affected files or modules, expected behavior, edge cases, and integration points.',
    'Keep the original intent. Do not invent requirements that are not implied.',
    'Output ONLY the improved description text -- no preamble, no markdown fences.',
  ];

  if (projectContext) {
    parts.push('', '--- Project Context ---', projectContext);
  }

  parts.push(
    '',
    '--- Current Feature ---',
    `Title: ${feature.title ?? '(untitled)'}`,
    `Description: ${feature.description}`
  );

  if (feature.successCriteria?.length) {
    parts.push(`Acceptance Criteria: ${feature.successCriteria.join('; ')}`);
  }

  if (feature.filesToModify?.length) {
    parts.push(`Files to Modify: ${feature.filesToModify.join(', ')}`);
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Types for injectable dependencies (enables testing without real AI calls)
// ---------------------------------------------------------------------------

export interface EnhancementModel {
  enhance(prompt: string): Promise<string>;
}

export interface ProjectContextLoader {
  load(projectPath: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// MaintenanceCheck implementation
// ---------------------------------------------------------------------------

export class FeatureReadinessCheck implements MaintenanceCheck {
  readonly id = 'feature-readiness';

  constructor(
    private readonly featureLoader: FeatureLoader,
    private readonly enhancementModel?: EnhancementModel,
    private readonly contextLoader?: ProjectContextLoader,
    private readonly weights: ReadinessWeights = DEFAULT_READINESS_WEIGHTS,
    private readonly threshold: number = 60
  ) {}

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    try {
      const features = await this.featureLoader.getAll(projectPath);
      const allFeatureIds = new Set(features.map((f) => f.id));

      const backlogFeatures = features.filter((f) => f.status === 'backlog');

      for (const feature of backlogFeatures) {
        const breakdown = computeReadinessScore(feature, allFeatureIds, this.weights);

        // Persist the score on the feature
        if (feature.readinessScore !== breakdown.total) {
          await this.featureLoader.update(projectPath, feature.id, {
            readinessScore: breakdown.total,
          });
        }

        if (breakdown.total >= this.threshold) continue;

        // Build a human-readable deficit summary
        const deficits: string[] = [];
        if (breakdown.dimensions.description < 1) {
          deficits.push('thin description');
        }
        if (breakdown.dimensions.acceptanceCriteria < 1) {
          deficits.push('insufficient acceptance criteria');
        }
        if (breakdown.dimensions.filesToModify < 1) {
          deficits.push('no filesToModify');
        }
        if (breakdown.dimensions.dependencyCompleteness < 1) {
          deficits.push('unresolved dependencies');
        }

        const hasEnhancementModel = !!this.enhancementModel;

        issues.push({
          checkId: this.id,
          severity: breakdown.total < 30 ? 'warning' : 'info',
          featureId: feature.id,
          message: `Feature "${feature.title || feature.id}" scored ${breakdown.total}/100 (threshold: ${this.threshold}). Deficits: ${deficits.join(', ')}`,
          autoFixable: hasEnhancementModel,
          fixDescription: hasEnhancementModel
            ? 'Enrich description using enhancement model with project context'
            : undefined,
          context: {
            featureId: feature.id,
            score: breakdown.total,
            threshold: this.threshold,
            dimensions: breakdown.dimensions,
            weighted: breakdown.weighted,
            projectPath,
          },
        });
      }
    } catch (error) {
      logger.error(`FeatureReadinessCheck failed for ${projectPath}:`, error);
    }

    return issues;
  }

  async fix(projectPath: string, issue: MaintenanceIssue): Promise<void> {
    if (!this.enhancementModel) return;

    const featureId = issue.featureId;
    if (!featureId) return;

    logger.info(`Enriching description for feature ${featureId}`);

    // Load project context for richer enrichment
    let projectContext = '';
    if (this.contextLoader) {
      try {
        projectContext = await this.contextLoader.load(projectPath);
      } catch {
        logger.warn(`Failed to load project context for ${projectPath}, proceeding without it`);
      }
    }

    // Load current feature state
    const features = await this.featureLoader.getAll(projectPath);
    const feature = features.find((f) => f.id === featureId);
    if (!feature) {
      logger.warn(`Feature ${featureId} not found during fix`);
      return;
    }

    const prompt = buildEnrichmentPrompt(feature, projectContext);
    const enrichedDescription = await this.enhancementModel.enhance(prompt);

    if (!enrichedDescription || enrichedDescription.trim().length === 0) {
      logger.warn(`Enhancement model returned empty result for feature ${featureId}`);
      return;
    }

    await this.featureLoader.update(
      projectPath,
      featureId,
      { description: enrichedDescription.trim() },
      'enhance'
    );

    // Recompute and persist the updated score
    const updatedFeatures = await this.featureLoader.getAll(projectPath);
    const updatedFeature = updatedFeatures.find((f) => f.id === featureId);
    if (updatedFeature) {
      const allIds = new Set(updatedFeatures.map((f) => f.id));
      const newBreakdown = computeReadinessScore(updatedFeature, allIds, this.weights);
      await this.featureLoader.update(projectPath, featureId, {
        readinessScore: newBreakdown.total,
      });
    }

    logger.info(`Enriched description for feature ${featureId}`);
  }
}
