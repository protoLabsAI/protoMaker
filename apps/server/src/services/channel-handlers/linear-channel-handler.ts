/**
 * Linear Channel Handler
 *
 * Implements ChannelHandler for features sourced from Linear.
 *
 * - requestApproval(): Posts a structured gate-hold comment to the Linear issue
 *   with /approve and /reject instructions. Tracks pending approvals in a Map.
 * - sendHITLForm(): Posts form questions as a Linear comment. Replies are
 *   captured via the existing linear:comment:followup event path.
 * - cancelPending(): Posts a cancellation comment and removes from pending Map.
 *
 * Falls back to UIChannelHandler behaviour (no-op) when linearIssueId is absent.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { Feature } from '@protolabs-ai/types';
import type { LinearCommentService } from '../linear-comment-service.js';
import type { PipelineOrchestrator } from '../pipeline-orchestrator.js';
import type { FeatureLoader } from '../feature-loader.js';

const logger = createLogger('LinearChannelHandler');

// ---------------------------------------------------------------------------
// Public interface — shared contract for all channel handlers
// ---------------------------------------------------------------------------

export interface ChannelHandler {
  /**
   * Request human approval for a pipeline gate hold.
   * The channel should present /approve and /reject instructions.
   */
  requestApproval(
    featureId: string,
    projectPath: string,
    context: ApprovalRequestContext
  ): Promise<void>;

  /**
   * Send a HITL form to the human operator.
   * Questions are posted as structured text; replies are captured by the
   * channel's incoming-message path.
   */
  sendHITLForm(featureId: string, projectPath: string, questions: string[]): Promise<void>;

  /**
   * Cancel a pending approval or HITL form request, typically because the
   * gate was resolved by another channel or system path.
   */
  cancelPending(featureId: string, projectPath: string, reason?: string): Promise<void>;
}

export interface ApprovalRequestContext {
  /** Human-readable description of what the gate is for */
  gateDescription: string;
  /** Optional pipeline phase label */
  phase?: string;
}

// ---------------------------------------------------------------------------
// Pending record types
// ---------------------------------------------------------------------------

interface PendingApproval {
  issueId: string;
  projectPath: string;
  requestedAt: string;
}

interface PendingHITLForm {
  issueId: string;
  projectPath: string;
  questions: string[];
  requestedAt: string;
}

// ---------------------------------------------------------------------------
// UIChannelHandler — fallback when linearIssueId is absent
// ---------------------------------------------------------------------------

/**
 * Minimal no-op fallback used when a feature has no Linear issue ID.
 * Gate approval notifications will be surfaced via the existing UI
 * notification channel instead.
 */
export class UIChannelHandler implements ChannelHandler {
  async requestApproval(
    featureId: string,
    _projectPath: string,
    context: ApprovalRequestContext
  ): Promise<void> {
    logger.info(
      `[UI] Gate hold for feature ${featureId}: ${context.gateDescription} (no Linear issue — approval via UI only)`
    );
  }

  async sendHITLForm(featureId: string, _projectPath: string, questions: string[]): Promise<void> {
    logger.info(
      `[UI] HITL form for feature ${featureId}: ${questions.length} question(s) (no Linear issue — form via UI only)`
    );
  }

  async cancelPending(featureId: string, _projectPath: string, reason?: string): Promise<void> {
    logger.info(`[UI] Cancel pending for feature ${featureId}${reason ? `: ${reason}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// LinearChannelHandler
// ---------------------------------------------------------------------------

export class LinearChannelHandler implements ChannelHandler {
  /** featureId → pending approval record */
  private pendingApprovals = new Map<string, PendingApproval>();
  /** featureId → pending HITL form record */
  private pendingForms = new Map<string, PendingHITLForm>();

  private readonly uiFallback = new UIChannelHandler();

  constructor(
    private commentService: LinearCommentService,
    private pipelineOrchestrator: PipelineOrchestrator,
    private featureLoader: FeatureLoader
  ) {}

  // -------------------------------------------------------------------------
  // ChannelHandler implementation
  // -------------------------------------------------------------------------

  async requestApproval(
    featureId: string,
    projectPath: string,
    context: ApprovalRequestContext
  ): Promise<void> {
    const issueId = await this.resolveIssueId(featureId, projectPath);
    if (!issueId) {
      return this.uiFallback.requestApproval(featureId, projectPath, context);
    }

    const phaseLabel = context.phase ? ` (${context.phase})` : '';
    const body = [
      `## ⏸ Gate Hold${phaseLabel}`,
      '',
      context.gateDescription,
      '',
      '**To proceed, reply with one of:**',
      '- `/approve` — advance the pipeline',
      '- `/reject` — reject and halt this stage',
    ].join('\n');

    await this.commentService.addCommentToIssue(projectPath, issueId, body);

    this.pendingApprovals.set(featureId, {
      issueId,
      projectPath,
      requestedAt: new Date().toISOString(),
    });

    logger.info(`Gate-hold comment posted to Linear issue ${issueId} for feature ${featureId}`);
  }

  async sendHITLForm(featureId: string, projectPath: string, questions: string[]): Promise<void> {
    const issueId = await this.resolveIssueId(featureId, projectPath);
    if (!issueId) {
      return this.uiFallback.sendHITLForm(featureId, projectPath, questions);
    }

    const questionLines = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    const body = [
      '## 🤔 Information Needed',
      '',
      'Please reply with answers to the following questions:',
      '',
      questionLines,
      '',
      '_Reply to this comment and I will continue._',
    ].join('\n');

    await this.commentService.addCommentToIssue(projectPath, issueId, body);

    this.pendingForms.set(featureId, {
      issueId,
      projectPath,
      questions,
      requestedAt: new Date().toISOString(),
    });

    logger.info(`HITL form posted to Linear issue ${issueId} for feature ${featureId}`);
  }

  async cancelPending(featureId: string, projectPath: string, reason?: string): Promise<void> {
    const pending = this.pendingApprovals.get(featureId) ?? this.pendingForms.get(featureId);
    if (!pending) {
      // No pending request — nothing to cancel
      return;
    }

    const issueId = pending.issueId;
    const reasonText = reason ? `\n\nReason: ${reason}` : '';
    const body = `## ✅ Gate Resolved\n\nThe pending approval or form request for this issue has been resolved by another path and no action is required here.${reasonText}`;

    await this.commentService.addCommentToIssue(projectPath, issueId, body).catch((err) => {
      logger.warn(`Failed to post cancellation comment to Linear issue ${issueId}:`, err);
    });

    this.pendingApprovals.delete(featureId);
    this.pendingForms.delete(featureId);

    logger.info(`Cancelled pending request on Linear issue ${issueId} for feature ${featureId}`);
  }

  // -------------------------------------------------------------------------
  // Gate resolution — called by LinearCommentService when /approve or /reject
  // is detected on a feature with a pending approval
  // -------------------------------------------------------------------------

  /**
   * Check whether this feature has a pending gate approval and, if so,
   * resolve it via PipelineOrchestrator.
   *
   * @returns true if a pending approval was found and resolveGate was called
   */
  async tryResolveGate(
    featureId: string,
    projectPath: string,
    action: 'advance' | 'reject'
  ): Promise<boolean> {
    if (!this.pendingApprovals.has(featureId)) {
      return false;
    }

    this.pendingApprovals.delete(featureId);

    const resolved = await this.pipelineOrchestrator.resolveGate(
      projectPath,
      featureId,
      action,
      'user'
    );

    if (resolved) {
      logger.info(
        `Gate ${action === 'advance' ? 'advanced' : 'rejected'} for feature ${featureId} via Linear comment`
      );
    } else {
      logger.warn(`resolveGate returned false for feature ${featureId} (action: ${action})`);
    }

    return resolved;
  }

  /**
   * Returns true if this feature has a pending approval in this handler.
   */
  hasPendingApproval(featureId: string): boolean {
    return this.pendingApprovals.has(featureId);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async resolveIssueId(featureId: string, projectPath: string): Promise<string | null> {
    try {
      const feature: Feature | null = await this.featureLoader.get(projectPath, featureId);
      return feature?.linearIssueId ?? null;
    } catch (err) {
      logger.warn(`Failed to resolve linearIssueId for feature ${featureId}:`, err);
      return null;
    }
  }
}
