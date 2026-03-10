/**
 * Antagonistic Review shared types
 *
 * Shared interfaces used by AntagonisticReviewService and AntagonisticReviewAdapter.
 */

import type { SPARCPrd } from './project.js';

/**
 * Review result from a single agent
 */
export interface ReviewResult {
  success: boolean;
  reviewer: string;
  verdict: string;
  concerns?: string[];
  recommendations?: string[];
  durationMs: number;
  error?: string;
}

/**
 * Consolidated review output
 */
export interface ConsolidatedReview {
  success: boolean;
  avaReview: ReviewResult;
  jonReview: ReviewResult;
  resolution: string;
  finalPRD?: SPARCPrd;
  totalDurationMs: number;
  totalCost?: number;
  traceId?: string;
  threadId?: string;
  hitlPending?: boolean;
  error?: string;
}

/**
 * Review request parameters
 */
export interface ReviewRequest {
  prd: SPARCPrd;
  prdId: string;
  projectPath: string;
}

/**
 * Extract a SPARCPrd from a resolution text string.
 * Parses ### Situation / Problem / Approach / Results / Constraints sections.
 * Returns the original PRD if sections cannot be found.
 */
export function extractPRDFromText(
  resolution: string,
  originalPrd: SPARCPrd
): SPARCPrd | undefined {
  try {
    const situationMatch = resolution.match(/### Situation\s+([\s\S]*?)(?=###|$)/);
    const problemMatch = resolution.match(/### Problem\s+([\s\S]*?)(?=###|$)/);
    const approachMatch = resolution.match(/### Approach\s+([\s\S]*?)(?=###|$)/);
    const resultsMatch = resolution.match(/### Results\s+([\s\S]*?)(?=###|$)/);
    const constraintsMatch = resolution.match(/### Constraints\s+([\s\S]*?)(?=###|$)/);

    if (situationMatch || problemMatch || approachMatch || resultsMatch) {
      return {
        situation: situationMatch?.[1]?.trim() || originalPrd.situation,
        problem: problemMatch?.[1]?.trim() || originalPrd.problem,
        approach: approachMatch?.[1]?.trim() || originalPrd.approach,
        results: resultsMatch?.[1]?.trim() || originalPrd.results,
        constraints: constraintsMatch?.[1]?.trim() || originalPrd.constraints,
        generatedAt: new Date().toISOString(),
      };
    }

    return originalPrd;
  } catch {
    return originalPrd;
  }
}
