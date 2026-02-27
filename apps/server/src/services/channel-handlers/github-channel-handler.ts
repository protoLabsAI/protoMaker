/**
 * GitHub Channel Handler
 *
 * Implements the ChannelHandler interface for GitHub-sourced features.
 * - requestApproval(): posts a gate-hold comment on the originating GitHub issue
 * - sendHITLForm(): posts a HITL form as an issue comment
 * - cancelPending(): posts a cancellation comment
 *
 * Pending approvals are stored keyed by featureId+issueNumber.
 * When an issue_comment event arrives with /approve or /reject,
 * resolveGate() is called accordingly.
 *
 * Falls back to UIChannelHandler when githubIssueNumber is missing.
 */

import { execSync } from 'node:child_process';
import { createLogger } from '@protolabs-ai/utils';
import type { HITLFormRequest } from '@protolabs-ai/types';
import type { EventEmitter } from '../../lib/events.js';
import type { PipelineOrchestrator } from '../pipeline-orchestrator.js';
import type { FeatureLoader } from '../feature-loader.js';

const logger = createLogger('GitHubChannelHandler');

// ─── ChannelHandler interface ────────────────────────────────────────────────

export interface ApprovalParams {
  featureId: string;
  issueNumber: number;
  projectPath: string;
}

export interface HITLFormParams {
  form: HITLFormRequest;
  issueNumber: number;
  projectPath: string;
}

export interface CancelParams {
  featureId: string;
  issueNumber: number;
  projectPath: string;
}

export interface ChannelHandler {
  requestApproval(params: ApprovalParams): Promise<void>;
  sendHITLForm(params: HITLFormParams): Promise<void>;
  cancelPending(params: CancelParams): Promise<void>;
}

// ─── UIChannelHandler — fallback when no GitHub issue is present ─────────────

export class UIChannelHandler implements ChannelHandler {
  constructor(_events: EventEmitter) {}

  async requestApproval({ featureId }: ApprovalParams): Promise<void> {
    logger.info(
      `[UIChannel] Gate hold for feature ${featureId} — no GitHub issue, skipping comment`
    );
  }

  async sendHITLForm({ form }: HITLFormParams): Promise<void> {
    logger.info(`[UIChannel] HITL form ${form.id} — no GitHub issue, UI will handle it`);
  }

  async cancelPending({ featureId }: CancelParams): Promise<void> {
    logger.info(`[UIChannel] Cancelling pending gate for feature ${featureId}`);
  }
}

// ─── Pending approval record ─────────────────────────────────────────────────

interface PendingApproval {
  featureId: string;
  issueNumber: number;
  projectPath: string;
}

// ─── GitHubChannelHandler ─────────────────────────────────────────────────────

export class GitHubChannelHandler implements ChannelHandler {
  /** key = `${featureId}:${issueNumber}` */
  private pendingApprovals = new Map<string, PendingApproval>();
  private unsubscribe?: () => void;

  constructor(
    private pipelineOrchestrator: PipelineOrchestrator,
    private events: EventEmitter,
    private featureLoader: FeatureLoader
  ) {}

  /**
   * Start listening for issue_comment webhook events.
   * Must be called after construction (in wiring.ts).
   */
  start(): void {
    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'webhook:github:issue_comment') {
        const p = payload as { issueNumber: number; body: string };
        this.handleIssueComment(p.issueNumber, p.body).catch((err) => {
          logger.error('Error handling issue_comment:', err);
        });
      }
    });
    logger.info('GitHubChannelHandler started');
  }

  stop(): void {
    this.unsubscribe?.();
    logger.info('GitHubChannelHandler stopped');
  }

  /**
   * Post a gate-hold comment on the originating GitHub issue.
   * Stores the pending approval so it can be resolved by a /approve or /reject comment.
   */
  async requestApproval({ featureId, issueNumber, projectPath }: ApprovalParams): Promise<void> {
    const body = [
      `## Gate Hold — Approval Required`,
      ``,
      `Feature **${featureId}** is paused at a pipeline gate and requires your decision.`,
      ``,
      `Reply to this issue with one of the following commands:`,
      ``,
      `- \`/approve\` — advance the feature to the next phase`,
      `- \`/reject\` — reject and halt the feature at this gate`,
    ].join('\n');

    try {
      this.postComment(projectPath, issueNumber, body);
      logger.info(`Posted gate-hold comment on issue #${issueNumber} for feature ${featureId}`);
    } catch (err) {
      logger.error(`Failed to post gate-hold comment on issue #${issueNumber}:`, err);
      throw err;
    }

    const key = this.pendingKey(featureId, issueNumber);
    this.pendingApprovals.set(key, { featureId, issueNumber, projectPath });
  }

  /**
   * Post a HITL form as an issue comment.
   * Stores as pending so replies captured via issue_comment handler.
   */
  async sendHITLForm({ form, issueNumber, projectPath }: HITLFormParams): Promise<void> {
    const featureId = form.featureId ?? 'unknown';

    const stepLines = form.steps.map((step, i) => {
      const title = step.title ?? `Step ${i + 1}`;
      const desc = step.description ? `\n  ${step.description}` : '';
      return `**${i + 1}. ${title}**${desc}`;
    });

    const body = [
      `## HITL Form — ${form.title}`,
      ``,
      form.description ? `${form.description}\n` : '',
      ...stepLines,
      ``,
      `Reply with \`/approve\` to submit or \`/reject\` to cancel.`,
      ``,
      `_Form ID: ${form.id}_`,
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    try {
      this.postComment(projectPath, issueNumber, body);
      logger.info(`Posted HITL form ${form.id} on issue #${issueNumber}`);
    } catch (err) {
      logger.error(`Failed to post HITL form on issue #${issueNumber}:`, err);
      throw err;
    }

    const key = this.pendingKey(featureId, issueNumber);
    this.pendingApprovals.set(key, { featureId, issueNumber, projectPath });
  }

  /**
   * Post a cancellation comment and remove the pending approval.
   */
  async cancelPending({ featureId, issueNumber, projectPath }: CancelParams): Promise<void> {
    const key = this.pendingKey(featureId, issueNumber);
    if (!this.pendingApprovals.has(key)) {
      logger.debug(`No pending approval to cancel for ${key}`);
      return;
    }

    const body = `Gate hold for feature **${featureId}** has been cancelled.`;

    try {
      this.postComment(projectPath, issueNumber, body);
      logger.info(`Posted cancellation comment on issue #${issueNumber} for feature ${featureId}`);
    } catch (err) {
      logger.warn(`Failed to post cancellation comment on issue #${issueNumber}:`, err);
    }

    this.pendingApprovals.delete(key);
  }

  /**
   * Called when a webhook:github:issue_comment event arrives.
   * If the comment contains /approve or /reject for a pending gate, resolveGate() is called.
   */
  async handleIssueComment(issueNumber: number, commentBody: string): Promise<void> {
    const hasApprove = /\/approve\b/i.test(commentBody);
    const hasReject = /\/reject\b/i.test(commentBody);

    if (!hasApprove && !hasReject) {
      return; // no action command — ignore
    }

    // Find the pending approval for this issue number
    let pending: PendingApproval | undefined;
    let pendingKey: string | undefined;

    for (const [key, p] of this.pendingApprovals) {
      if (p.issueNumber === issueNumber) {
        pending = p;
        pendingKey = key;
        break;
      }
    }

    if (!pending || !pendingKey) {
      logger.debug(`No pending gate for issue #${issueNumber} — ignoring comment`);
      return;
    }

    const action = hasApprove ? 'advance' : 'reject';

    logger.info(
      `Resolving gate for feature ${pending.featureId} on issue #${issueNumber}: ${action}`
    );

    try {
      const resolved = await this.pipelineOrchestrator.resolveGate(
        pending.projectPath,
        pending.featureId,
        action,
        'user'
      );

      if (resolved) {
        this.pendingApprovals.delete(pendingKey);
        logger.info(`Gate resolved (${action}) for feature ${pending.featureId}`);
      } else {
        logger.warn(
          `resolveGate returned false for feature ${pending.featureId} — gate may not be awaiting`
        );
      }
    } catch (err) {
      logger.error(`Failed to resolve gate for feature ${pending.featureId}:`, err);
    }
  }

  /**
   * Resolve the correct channel handler for a feature.
   * Returns this instance if the feature has a GitHub issue number,
   * otherwise returns the provided UIChannelHandler fallback.
   */
  async resolveHandler(
    projectPath: string,
    featureId: string,
    uiHandler: UIChannelHandler
  ): Promise<{ handler: ChannelHandler; issueNumber: number | undefined }> {
    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (feature?.githubIssueNumber) {
        return { handler: this, issueNumber: feature.githubIssueNumber };
      }
    } catch (err) {
      logger.warn(`Failed to load feature ${featureId} for channel resolution:`, err);
    }
    return { handler: uiHandler, issueNumber: undefined };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private pendingKey(featureId: string, issueNumber: number): string {
    return `${featureId}:${issueNumber}`;
  }

  private postComment(projectPath: string, issueNumber: number, body: string): void {
    const cmd = `gh issue comment ${issueNumber} --body ${this.shellEscape(body)}`;
    execSync(cmd, {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 30_000,
    });
  }

  private shellEscape(str: string): string {
    return "'" + str.replace(/'/g, "'\\''") + "'";
  }
}
