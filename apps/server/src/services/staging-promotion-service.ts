/**
 * StagingPromotionService — candidate tracking and git orchestration for the promotion pipeline.
 *
 * Two responsibilities:
 *  1. Candidate tracking: detects dev-merge events and persists promotion candidates
 *     atomically to .automaker/promotions/candidates.json.
 *  2. Promotion orchestration:
 *     - promoteToStaging(): Ava-autonomous — cherry-picks features onto a promotion branch,
 *       pushes it, creates a staging PR, and enables auto-merge.
 *     - promoteToMain(): HITL-gated — creates a staging→main PR (NO auto-merge) and
 *       notifies a human via HITLFormService.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabs-ai/utils';
import { getAutomakerDir } from '@protolabs-ai/platform';
import type {
  PromotionBatch,
  PromotionCandidate,
  PromotionStatus,
  HITLFormRequestInput,
} from '@protolabs-ai/types';
import type { HITLFormService } from './hitl-form-service.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('StagingPromotionService');

const PROMOTIONS_DIR = 'promotions';
const CANDIDATES_FILE = 'candidates.json';

export class StagingPromotionService {
  private hitlFormService?: HITLFormService;

  /** Inject optional HITLFormService — same setter pattern as LeadEngineerService */
  setHITLFormService(s: HITLFormService): void {
    this.hitlFormService = s;
  }

  // ---------------------------------------------------------------------------
  // Candidate tracking
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Promotion orchestration
  // ---------------------------------------------------------------------------

  /**
   * Ava-autonomous promotion to staging.
   *
   * 1. Fetches origin to ensure latest refs are available.
   * 2. Creates the promotion branch off origin/staging HEAD.
   * 3. Cherry-picks each candidate's commitSha in order.
   *    On conflict: aborts the cherry-pick and marks the candidate status=held;
   *    continues with remaining candidates.
   * 4. Pushes the promotion branch to origin.
   * 5. Creates a PR from the promotion branch into staging (via gh cli).
   * 6. Enables auto-merge on the staging PR (--squash).
   * 7. Updates each successfully cherry-picked candidate to status=promoted
   *    and sets batch.stagingPrUrl.
   */
  async promoteToStaging(batch: PromotionBatch, projectPath: string): Promise<void> {
    const branchName = batch.promotionBranchName;

    // 1. Fetch origin so origin/staging is up to date
    logger.info(`[batch=${batch.batchId}] Fetching origin...`);
    await execFileAsync('git', ['fetch', 'origin'], { cwd: projectPath });

    // 2. Create (or reset) the promotion branch off origin/staging HEAD
    logger.info(`[batch=${batch.batchId}] Creating branch ${branchName} from origin/staging`);
    await execFileAsync('git', ['checkout', '-B', branchName, 'origin/staging'], {
      cwd: projectPath,
    });

    // 3. Cherry-pick each candidate sequentially
    const promoted: PromotionCandidate[] = [];
    for (const candidate of batch.candidates) {
      try {
        logger.info(
          `[batch=${batch.batchId}] Cherry-picking ${candidate.commitSha} (${candidate.featureId})`
        );
        await execFileAsync('git', ['cherry-pick', candidate.commitSha], { cwd: projectPath });
        promoted.push(candidate);
      } catch (err) {
        logger.warn(
          `[batch=${batch.batchId}] Cherry-pick conflict for ${candidate.commitSha} ` +
            `(${candidate.featureId}); aborting and marking as held`
        );
        // Abort the in-progress cherry-pick
        try {
          await execFileAsync('git', ['cherry-pick', '--abort'], { cwd: projectPath });
        } catch (abortErr) {
          logger.error(`[batch=${batch.batchId}] git cherry-pick --abort failed:`, abortErr);
        }
        candidate.status = 'held';
        // Continue with remaining candidates
      }
    }

    // 4. Push the promotion branch
    logger.info(`[batch=${batch.batchId}] Pushing ${branchName} to origin`);
    await execFileAsync('git', ['push', '-u', 'origin', branchName, '--force-with-lease'], {
      cwd: projectPath,
    });

    // 5. Build PR body listing included features
    const featureList =
      promoted.length > 0
        ? promoted
            .map(
              (c) =>
                `- **${c.featureTitle}** (\`${c.featureId}\`) — commit \`${c.commitSha.slice(0, 8)}\``
            )
            .join('\n')
        : '_No features were successfully cherry-picked._';

    const heldList = batch.candidates
      .filter((c) => c.status === 'held')
      .map((c) => `- ${c.featureTitle} (\`${c.featureId}\`) — cherry-pick conflict`)
      .join('\n');

    const prBody = [
      `## Promotion Batch: ${batch.batchId}`,
      '',
      '### Included Features',
      featureList,
      ...(heldList ? ['', '### Held (Cherry-Pick Conflicts)', heldList] : []),
    ].join('\n');

    const prTitle = `Promote ${batch.batchId} to staging`;

    // 6. Create PR into staging via gh cli
    logger.info(`[batch=${batch.batchId}] Creating staging PR: ${branchName} → staging`);
    const { stdout: prOutput } = await execFileAsync(
      'gh',
      [
        'pr',
        'create',
        '--base',
        'staging',
        '--head',
        branchName,
        '--title',
        prTitle,
        '--body',
        prBody,
      ],
      { cwd: projectPath }
    );
    const prUrl = prOutput.trim();
    logger.info(`[batch=${batch.batchId}] Staging PR created: ${prUrl}`);

    // 7. Enable auto-merge on the staging PR
    // gh pr create prints the PR URL; extract the PR number from the trailing path segment
    const prNumber = prUrl.split('/').at(-1);
    if (prNumber && /^\d+$/.test(prNumber)) {
      logger.info(`[batch=${batch.batchId}] Enabling auto-merge on staging PR #${prNumber}`);
      try {
        await execFileAsync('gh', ['pr', 'merge', '--auto', '--squash', prNumber], {
          cwd: projectPath,
        });
      } catch (err) {
        logger.warn(
          `[batch=${batch.batchId}] Failed to enable auto-merge on PR #${prNumber}:`,
          err
        );
      }
    } else {
      logger.warn(
        `[batch=${batch.batchId}] Could not parse PR number from URL "${prUrl}"; skipping auto-merge`
      );
    }

    // 8. Update candidate statuses and batch metadata
    for (const candidate of promoted) {
      candidate.status = 'promoted';
    }
    batch.stagingPrUrl = prUrl;

    logger.info(
      `[batch=${batch.batchId}] promoteToStaging complete — ` +
        `promoted=${promoted.length}, held=${batch.candidates.filter((c) => c.status === 'held').length}`
    );
  }

  /**
   * HITL-gated promotion to main.
   *
   * 1. Creates a PR from staging into main via gh cli (NO auto-merge).
   * 2. Calls this.hitlFormService?.create() to notify a human reviewer.
   * 3. Updates batch.mainPrUrl.
   *
   * Ava never merges this PR herself — she only creates it and notifies.
   */
  async promoteToMain(batch: PromotionBatch, projectPath: string): Promise<void> {
    logger.info(`[batch=${batch.batchId}] Creating staging → main PR`);

    const promotedCandidates = batch.candidates.filter((c) => c.status === 'promoted');
    const featureList =
      promotedCandidates.length > 0
        ? promotedCandidates.map((c) => `- ${c.featureTitle} (\`${c.featureId}\`)`).join('\n')
        : '_No promoted features in this batch._';

    const prBody = [
      `## Production Promotion: ${batch.batchId}`,
      '',
      '### Features',
      featureList,
      '',
      '> ⚠️ **Human review and approval required before merging.**',
      '> Ava does not merge this PR automatically.',
    ].join('\n');

    const prTitle = `Promote batch ${batch.batchId} to main`;

    // Create the PR from staging into main — NO auto-merge
    const { stdout: prOutput } = await execFileAsync(
      'gh',
      ['pr', 'create', '--base', 'main', '--head', 'staging', '--title', prTitle, '--body', prBody],
      { cwd: projectPath }
    );
    const prUrl = prOutput.trim();
    logger.info(`[batch=${batch.batchId}] Main PR created: ${prUrl}`);

    // Update batch with the PR URL
    batch.mainPrUrl = prUrl;

    // Notify via HITLFormService — direct server-side call, NOT MCP tool
    const hitlInput: HITLFormRequestInput = {
      title: `Approve Promotion to Main: ${batch.batchId}`,
      description: [
        `A **staging → main** PR has been created for promotion batch **${batch.batchId}**.`,
        '',
        `**PR:** ${prUrl}`,
        '',
        `**Features (${promotedCandidates.length}):**`,
        featureList,
        '',
        'Please review the PR and approve or reject the promotion.',
      ].join('\n'),
      steps: [
        {
          title: 'Promotion Approval',
          description: `Batch ${batch.batchId} — ${promotedCandidates.length} feature(s) ready for main`,
          schema: {
            type: 'object',
            properties: {
              decision: {
                type: 'string',
                title: 'Decision',
                enum: ['approve', 'reject'],
              },
              notes: {
                type: 'string',
                title: 'Notes (optional)',
              },
            },
            required: ['decision'],
          },
          uiSchema: {
            decision: { 'ui:widget': 'radio' },
            notes: { 'ui:widget': 'textarea' },
          },
        },
      ],
      callerType: 'flow',
      projectPath,
    };

    this.hitlFormService?.create(hitlInput);

    logger.info(
      `[batch=${batch.batchId}] promoteToMain complete — mainPrUrl=${prUrl}, HITL form created`
    );
  }
}

// Shared singleton instance
export const stagingPromotionService = new StagingPromotionService();
