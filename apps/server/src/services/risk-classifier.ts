/**
 * Risk Classifier Service - AI-powered work item risk assessment
 *
 * Classifies work items (PRDs, features, tasks) on multiple risk dimensions
 * to determine if they can be auto-approved or require human review.
 *
 * Uses a lightweight Haiku model for fast, cost-effective classification.
 */

import type { RiskLevel } from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import Anthropic from '@anthropic-ai/sdk';

const logger = createLogger('RiskClassifier');

/**
 * Risk dimensions for classification
 */
export interface RiskDimensions {
  /** Scope of changes (number of files, LOC, architectural impact) */
  scope: RiskLevel;
  /** Blast radius (how many users/systems affected if it goes wrong) */
  blastRadius: RiskLevel;
  /** Reversibility (how easy to rollback) */
  reversibility: RiskLevel;
  /** Test coverage (existing tests, testability) */
  testCoverage: RiskLevel;
}

/**
 * Classification result with reasoning
 */
export interface RiskClassification {
  /** Overall risk level (highest of all dimensions) */
  overallRisk: RiskLevel;
  /** Individual dimension scores */
  dimensions: RiskDimensions;
  /** Whether this can be auto-approved */
  autoApprove: boolean;
  /** Explanation of the classification */
  reasoning: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Work item to classify (simplified interface)
 */
export interface WorkItemForClassification {
  title: string;
  description: string;
  /** Optional: file paths that will be modified */
  filesToModify?: string[];
  /** Optional: acceptance criteria */
  acceptanceCriteria?: string[];
  /** Optional: estimated complexity */
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
}

/**
 * Risk classifier configuration
 */
export interface RiskClassifierConfig {
  /** Threshold below which items are auto-approved (inclusive) */
  autoApproveThreshold: RiskLevel;
  /** Anthropic API client */
  anthropic: Anthropic;
}

/**
 * Default configuration
 */
const DEFAULT_AUTO_APPROVE_THRESHOLD: RiskLevel = 'low';

/**
 * Risk level ordering for comparison
 */
const RISK_ORDER: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Classification prompt template
 */
function buildClassificationPrompt(item: WorkItemForClassification): string {
  return `You are a risk classifier for software development work items. Analyze the following work item and classify it across four risk dimensions.

**Work Item:**
Title: ${item.title}
Description: ${item.description}
${item.filesToModify ? `Files to modify: ${item.filesToModify.join(', ')}` : ''}
${item.acceptanceCriteria ? `Acceptance criteria:\n${item.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}` : ''}
${item.complexity ? `Estimated complexity: ${item.complexity}` : ''}

**Risk Dimensions to Evaluate:**

1. **Scope** - Scale of changes (files, LOC, architectural impact)
   - low: 1-2 files, <50 LOC, no architecture changes
   - medium: 3-5 files, <200 LOC, minor refactoring
   - high: 6+ files, >200 LOC, architectural changes
   - critical: Major architectural overhaul, breaking changes

2. **Blast Radius** - Impact if it goes wrong
   - low: Isolated feature, few users affected, non-critical path
   - medium: Multiple features affected, moderate user base
   - high: Core functionality, large user base, revenue-impacting
   - critical: Security vulnerability, data loss risk, system-wide failure

3. **Reversibility** - How easy to rollback
   - low: Pure code changes, no data migrations, easy git revert
   - medium: Config changes, schema-compatible migrations
   - high: Breaking migrations, external integrations
   - critical: Irreversible data transformations, third-party dependencies

4. **Test Coverage** - Testing requirements and existing coverage
   - low: Well-tested area, clear test path, isolated logic
   - medium: Moderate coverage, requires new tests
   - high: Low coverage area, complex test setup required
   - critical: Untestable without major refactoring, legacy code

**Auto-Approve Categories (typically LOW risk across all dimensions):**
- Documentation updates (README, comments, markdown files)
- Test additions (new test files, additional test cases)
- Small bug fixes (1-2 line changes, obvious fixes)
- Code formatting (prettier, linting, whitespace)
- Dependency bumps (patch/minor versions, dev dependencies)
- Type definitions (TypeScript types, interfaces)

**Require Approval Categories (typically MEDIUM+ risk):**
- New features (new API endpoints, UI components)
- Architectural changes (new patterns, service restructuring)
- Security-sensitive code (auth, permissions, data access)
- Database migrations (schema changes, data transformations)
- Major dependency bumps (breaking versions, core libraries)
- Third-party integrations (external APIs, webhooks)

Respond with a JSON object in this exact format:
{
  "scope": "low|medium|high|critical",
  "blastRadius": "low|medium|high|critical",
  "reversibility": "low|medium|high|critical",
  "testCoverage": "low|medium|high|critical",
  "reasoning": "Brief explanation of why these risk levels were assigned",
  "confidence": 0.0-1.0
}

Analyze the work item and respond with ONLY the JSON object, no additional text.`;
}

/**
 * Risk Classifier Service
 */
export class RiskClassifier {
  private readonly config: RiskClassifierConfig;

  constructor(config: RiskClassifierConfig) {
    this.config = config;
  }

  /**
   * Classify a work item and determine if it can be auto-approved
   */
  async classify(item: WorkItemForClassification): Promise<RiskClassification> {
    logger.info(`Classifying work item: ${item.title}`);

    const prompt = buildClassificationPrompt(item);
    const model = resolveModelString('haiku');

    try {
      const response = await this.config.anthropic.messages.create({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response from classifier');
      }

      // Parse JSON response
      const result = JSON.parse(content.text);

      const dimensions: RiskDimensions = {
        scope: result.scope as RiskLevel,
        blastRadius: result.blastRadius as RiskLevel,
        reversibility: result.reversibility as RiskLevel,
        testCoverage: result.testCoverage as RiskLevel,
      };

      // Overall risk is the highest dimension
      const overallRisk = this.getHighestRisk(dimensions);

      // Auto-approve if overall risk is at or below threshold
      const autoApprove = RISK_ORDER[overallRisk] <= RISK_ORDER[this.config.autoApproveThreshold];

      const classification: RiskClassification = {
        overallRisk,
        dimensions,
        autoApprove,
        reasoning: result.reasoning,
        confidence: result.confidence,
      };

      logger.info(
        `Classification complete: ${overallRisk} risk, auto-approve=${autoApprove}, confidence=${result.confidence}`
      );

      return classification;
    } catch (error) {
      logger.error('Classification failed:', error);
      // On error, be conservative: require approval
      return {
        overallRisk: 'high',
        dimensions: {
          scope: 'high',
          blastRadius: 'high',
          reversibility: 'high',
          testCoverage: 'high',
        },
        autoApprove: false,
        reasoning: `Classification failed: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
      };
    }
  }

  /**
   * Update the auto-approve threshold
   */
  updateThreshold(newThreshold: RiskLevel): void {
    logger.info(
      `Updating auto-approve threshold: ${this.config.autoApproveThreshold} -> ${newThreshold}`
    );
    this.config.autoApproveThreshold = newThreshold;
  }

  /**
   * Get the current threshold
   */
  getThreshold(): RiskLevel {
    return this.config.autoApproveThreshold;
  }

  /**
   * Find the highest risk level across all dimensions
   */
  private getHighestRisk(dimensions: RiskDimensions): RiskLevel {
    const levels = [
      dimensions.scope,
      dimensions.blastRadius,
      dimensions.reversibility,
      dimensions.testCoverage,
    ];

    let highest: RiskLevel = 'low';
    let highestOrder = 0;

    for (const level of levels) {
      const order = RISK_ORDER[level];
      if (order > highestOrder) {
        highest = level;
        highestOrder = order;
      }
    }

    return highest;
  }
}

/**
 * Create a risk classifier with default configuration
 */
export function createRiskClassifier(
  anthropic: Anthropic,
  autoApproveThreshold: RiskLevel = DEFAULT_AUTO_APPROVE_THRESHOLD
): RiskClassifier {
  return new RiskClassifier({
    anthropic,
    autoApproveThreshold,
  });
}
