/**
 * Triage Service - Auto-classification, priority assignment, and team routing
 *
 * When issues are created (by IssueCreationService), TriageService classifies
 * them by priority and assigns to the appropriate team based on file paths
 * and failure signals.
 */

import type { FailureCategory } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('TriageService');

/**
 * Issue priority levels (GitHub compatible)
 * P1 = Urgent, P2 = High, P3 = Normal, P4 = Low
 */
export type IssuePriority = 1 | 2 | 3 | 4;

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  1: 'P1: Urgent',
  2: 'P2: High',
  3: 'P3: Normal',
  4: 'P4: Low',
};

/**
 * Team assignment for routing issues
 */
export type TeamAssignment = 'frontend' | 'backend' | 'devops' | 'general';

export interface TriageResult {
  priority: IssuePriority;
  priorityLabel: string;
  team: TeamAssignment;
  labels: string[];
  reason: string;
}

export interface TriageInput {
  featureId: string;
  projectPath: string;
  failureCategory?: FailureCategory;
  retryCount?: number;
  error?: string;
  /** Files modified by the feature (for team routing) */
  relatedFiles?: string[];
  /** Number of features blocked by this one */
  blockedDependentCount?: number;
  /** Whether this came from a CI failure */
  isCIFailure?: boolean;
}

export class TriageService {
  constructor(private events: EventEmitter) {}

  /**
   * Classify an issue and determine priority + team assignment
   */
  triage(input: TriageInput): TriageResult {
    const priority = this.determinePriority(input);
    const team = this.determineTeam(input.relatedFiles);
    const labels = this.determineLabels(input, priority, team);
    const reason = this.explainPriority(input, priority);

    const result: TriageResult = {
      priority,
      priorityLabel: PRIORITY_LABELS[priority],
      team,
      labels,
      reason,
    };

    logger.info(`Triaged feature ${input.featureId}: ${result.priorityLabel}, team=${team}`, {
      featureId: input.featureId,
      priority,
      team,
      labels,
    });

    this.events.emit('issue:triage-completed', {
      featureId: input.featureId,
      projectPath: input.projectPath,
      ...result,
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * Determine priority based on failure signals
   */
  private determinePriority(input: TriageInput): IssuePriority {
    const { failureCategory, blockedDependentCount } = input;

    // P1: Auth/quota failures (system-wide impact)
    if (failureCategory === 'authentication' || failureCategory === 'quota') {
      return 1;
    }

    // P1: Blocks 2+ other features (high blast radius)
    if (blockedDependentCount && blockedDependentCount >= 2) {
      return 1;
    }

    // P2: CI/test failures (merged code is broken)
    if (input.isCIFailure || failureCategory === 'test_failure') {
      return 2;
    }

    // P3: Single feature blocked (normal)
    if (failureCategory === 'tool_error' || failureCategory === 'dependency') {
      return 3;
    }

    // P4: Transient/unknown errors (likely self-resolving)
    if (failureCategory === 'transient' || failureCategory === 'rate_limit') {
      return 4;
    }

    // Default: P3 Normal
    return 3;
  }

  /**
   * Determine team assignment based on related file paths
   */
  private determineTeam(relatedFiles?: string[]): TeamAssignment {
    if (!relatedFiles || relatedFiles.length === 0) {
      return 'general';
    }

    let frontendCount = 0;
    let backendCount = 0;
    let devopsCount = 0;

    for (const file of relatedFiles) {
      const normalized = file.replace(/\\/g, '/');

      if (
        normalized.includes('apps/ui/') ||
        normalized.includes('.tsx') ||
        normalized.includes('.css')
      ) {
        frontendCount++;
      } else if (normalized.includes('apps/server/') || normalized.includes('libs/')) {
        backendCount++;
      } else if (
        normalized.includes('.github/') ||
        normalized.includes('docker') ||
        normalized.includes('Dockerfile') ||
        normalized.includes('.yml') ||
        normalized.includes('scripts/')
      ) {
        devopsCount++;
      }
    }

    // Return the team with the most matching files
    const max = Math.max(frontendCount, backendCount, devopsCount);
    if (max === 0) return 'general';
    if (devopsCount === max) return 'devops';
    if (frontendCount === max) return 'frontend';
    return 'backend';
  }

  /**
   * Build label set for the issue
   */
  private determineLabels(
    input: TriageInput,
    priority: IssuePriority,
    team: TeamAssignment
  ): string[] {
    const labels: string[] = ['auto-triage'];

    // Priority label
    labels.push(`priority:p${priority}`);

    // Team label
    labels.push(`team:${team}`);

    // Failure category label
    if (input.failureCategory) {
      labels.push(`failure:${input.failureCategory}`);
    }

    // CI failure
    if (input.isCIFailure) {
      labels.push('ci-failure');
    }

    // High retry count
    if (input.retryCount && input.retryCount >= 3) {
      labels.push('max-retries');
    }

    return labels;
  }

  /**
   * Human-readable explanation of why this priority was assigned
   */
  private explainPriority(input: TriageInput, priority: IssuePriority): string {
    switch (priority) {
      case 1:
        if (input.failureCategory === 'authentication' || input.failureCategory === 'quota') {
          return `P1: ${input.failureCategory} failure affects all agent operations`;
        }
        return `P1: Blocks ${input.blockedDependentCount}+ dependent features`;
      case 2:
        return input.isCIFailure
          ? 'P2: CI pipeline failure on merged code'
          : 'P2: Test failures blocking feature completion';
      case 3:
        return 'P3: Single feature blocked, no downstream impact';
      case 4:
        return 'P4: Transient error, likely self-resolving';
      default:
        return 'P3: Default priority';
    }
  }
}
