/**
 * StagingPromotionService - Candidate tracking for the promotion pipeline
 *
 * Detects when features are merged to dev and creates promotion candidates.
 * Candidates are persisted atomically to .automaker/promotions/candidates.json.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabs-ai/utils';
import { getAutomakerDir } from '@protolabs-ai/platform';
import type { PromotionCandidate, PromotionStatus } from '@protolabs-ai/types';

const logger = createLogger('StagingPromotionService');

const PROMOTIONS_DIR = 'promotions';
const CANDIDATES_FILE = 'candidates.json';

export class StagingPromotionService {
  /**
   * Detect whether a dev merge event should trigger promotion candidate creation.
   * Returns true when the feature is valid and a commit SHA is present.
   *
   * @param feature - The matched feature (or null if no feature was found)
   * @param commitSha - The merge commit SHA from the PR payload
   */
  detectDevMerge(
    feature: { id: string; title?: string; branchName?: string } | null,
    commitSha: string
  ): boolean {
    if (!feature) {
      logger.debug('detectDevMerge: no feature matched, skipping candidate creation');
      return false;
    }
    if (!commitSha) {
      logger.debug(
        `detectDevMerge: no commit SHA for feature ${feature.id}, skipping candidate creation`
      );
      return false;
    }
    logger.info(`detectDevMerge: feature "${feature.id}" merged to dev with commit ${commitSha}`);
    return true;
  }

  /**
   * Create a promotion candidate for a feature merged to the dev branch.
   * Writes the candidate atomically to .automaker/promotions/candidates.json.
   * If a candidate already exists for the feature, it is updated in-place.
   *
   * @param projectPath - Absolute path to the project root
   * @param featureId - ID of the feature being promoted
   * @param commitSha - The squash commit SHA from the merge
   * @param featureTitle - Human-readable title of the feature
   * @param branchName - The feature branch that was merged
   */
  async createCandidate(
    projectPath: string,
    featureId: string,
    commitSha: string,
    featureTitle: string,
    branchName: string
  ): Promise<PromotionCandidate> {
    const candidate: PromotionCandidate = {
      featureId,
      featureTitle,
      branchName,
      commitSha,
      mergedAt: new Date().toISOString(),
      status: 'candidate',
    };

    const filePath = this.getCandidatesPath(projectPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Read existing candidates
    const result = await readJsonWithRecovery<PromotionCandidate[]>(filePath, []);
    const candidates = result.data ?? [];

    // Avoid duplicates — update in-place if the feature already has a candidate
    const existingIndex = candidates.findIndex((c) => c.featureId === featureId);
    if (existingIndex >= 0) {
      candidates[existingIndex] = candidate;
      logger.info(`Updated existing promotion candidate for feature ${featureId}`);
    } else {
      candidates.push(candidate);
      logger.info(`Created promotion candidate for feature ${featureId} with commit ${commitSha}`);
    }

    await atomicWriteJson(filePath, candidates);
    return candidate;
  }

  /**
   * List all promotion candidates for a project, optionally filtered by status.
   *
   * @param projectPath - Absolute path to the project root
   * @param status - Optional status filter
   */
  async listCandidates(
    projectPath: string,
    status?: PromotionStatus
  ): Promise<PromotionCandidate[]> {
    const filePath = this.getCandidatesPath(projectPath);
    try {
      const result = await readJsonWithRecovery<PromotionCandidate[]>(filePath, []);
      const candidates = result.data ?? [];
      if (status) {
        return candidates.filter((c) => c.status === status);
      }
      return candidates;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to list promotion candidates:', err);
      }
      return [];
    }
  }

  /**
   * Update the status of a promotion candidate.
   *
   * @param projectPath - Absolute path to the project root
   * @param featureId - ID of the feature whose candidate status to update
   * @param status - New status value
   */
  async updateCandidateStatus(
    projectPath: string,
    featureId: string,
    status: PromotionStatus
  ): Promise<void> {
    const filePath = this.getCandidatesPath(projectPath);
    const result = await readJsonWithRecovery<PromotionCandidate[]>(filePath, []);
    const candidates = result.data ?? [];

    const candidate = candidates.find((c) => c.featureId === featureId);
    if (!candidate) {
      logger.warn(`No promotion candidate found for feature ${featureId}`);
      return;
    }

    candidate.status = status;
    await atomicWriteJson(filePath, candidates);
    logger.info(`Updated promotion candidate ${featureId} status to "${status}"`);
  }

  private getCandidatesPath(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), PROMOTIONS_DIR, CANDIDATES_FILE);
  }
}

// Shared singleton instance
export const stagingPromotionService = new StagingPromotionService();
