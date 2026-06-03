/**
 * FeatureLifecycleBusPublisher — forwards terminal board-feature transitions to
 * the protoWorkstacean bus so downstream consumers can close the loop without
 * polling protoMaker.
 *
 * Subscribes to the existing `feature:status-changed` event (emitted by
 * FeatureLoader.update) and, when a feature transitions into a terminal state,
 * publishes one of three dotted, unprefixed topics workstacean's consumers
 * subscribe to:
 *
 *   - `done`      → `feature.completed`
 *   - `blocked`   → `feature.blocked`   (carries a `kind` failure discriminator)
 *   - `escalated` → `feature.failed`    (already escalated — no auto-remediation)
 *
 * `feature.blocked` is split out of the generic `feature.failed` so
 * workstacean's FeatureRemediationPlugin can route a per-feature signal to
 * ignore / HITL / dispatch-Roxy based on `kind`. See protoLabsAI/protoMaker#4067
 * (this side) and protoLabsAI/protoWorkstacean#779 / #776 (the consumer + the
 * flag day that depends on this emission). Greenfield: a `blocked` transition
 * emits ONLY `feature.blocked`, never also `feature.failed`.
 *
 * The payload echoes the originating signal metadata so a consumer (e.g. the
 * Linear ↔ protoMaker bridge) can reconstruct lineage and post a status comment
 * on the source issue. See protoLabsAI/protoMaker#3549 and the downstream
 * consumer protoLabsAI/protoWorkstacean#482.
 *
 * Opt-in: only active when WORKSTACEAN_URL is explicitly set, so installs
 * without protoWorkstacean don't attempt (and log) a publish on every feature
 * completion.
 */

import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import { publish as workstaceanPublish } from '../client/workstacean-api.client.js';

const logger = createLogger('FeatureLifecycleBusPublisher');

/** Board statuses treated as terminal (success) — emit `feature.completed`. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['done']);

/** Board status that emits the kinded `feature.blocked` (remediable failure). */
const BLOCKED_STATUSES: ReadonlySet<string> = new Set(['blocked']);

/** Board status that emits `feature.failed` (already escalated — no remediation). */
const ESCALATED_STATUSES: ReadonlySet<string> = new Set(['escalated']);

/**
 * Failure-category discriminator workstacean's router consumes to decide
 * ignore vs HITL vs dispatch-Roxy. Mirrors the `kind` vocabulary in
 * protoLabsAI/protoWorkstacean#779. `undefined` is safe — the router treats a
 * missing kind as remediable (dispatches Roxy).
 */
export type BlockedKind =
  | 'dependency_unsatisfied'
  | 'external_dependency_unsatisfied'
  | 'cost_exceeded'
  | 'runtime_exceeded'
  | 'quota'
  | 'rate_limit'
  | 'worktree_safety'
  | 'ci_failure'
  | 'merge_conflict'
  | 'changes_requested'
  | 'retries_exhausted';

/**
 * Map a human block reason to a workstacean `kind`. First match wins, ordered
 * most-specific → least. Returns `undefined` for an unrecognized reason so the
 * router falls back to its remediable default. This is the keyword-matching
 * fallback described in #4067; if a structured failure category is later
 * threaded onto the feature record, prefer it over this text match.
 *
 * Routing reference (protoWorkstacean#779):
 *   dependency_unsatisfied / external_dependency_unsatisfied → ignored (self-heals)
 *   cost_exceeded / runtime_exceeded / quota / rate_limit / worktree_safety → HITL
 *   ci_failure / merge_conflict / changes_requested / retries_exhausted / else → Roxy
 */
export function deriveBlockedKind(reason: string | undefined): BlockedKind | undefined {
  const r = (reason ?? '').toLowerCase();
  if (!r) return undefined;

  // Feature-DAG dependency not satisfied — protoMaker self-heals on staleDeps,
  // so the router ignores it. Matched narrowly so npm/missing-module errors
  // (which Roxy CAN fix) are NOT silently swallowed here.
  if (
    /stale.?dep|dependenc(?:y|ies) (?:unsatisfied|not (?:met|satisfied))|blocked by (?:its )?(?:upstream|dependenc|feature)|waiting (?:on|for) (?:its )?(?:upstream|dependenc)/.test(
      r
    )
  ) {
    return 'dependency_unsatisfied';
  }

  // Worktree safety guard (dirty / uncommitted / refusing to corrupt main). HITL.
  if (
    /worktree.*(?:safety|uncommitted|dirty|corrupt)|refus\w* to fall back|main working tree/.test(r)
  ) {
    return 'worktree_safety';
  }

  // Cost / budget ceiling. HITL.
  if (/cost.*(?:exceed|limit|cap)|budget.*(?:exceed|exhaust|cap)|error.?budget/.test(r)) {
    return 'cost_exceeded';
  }

  // API rate limit. HITL.
  if (/rate.?limit|too many requests|\b429\b|throttl/.test(r)) {
    return 'rate_limit';
  }

  // Usage quota. HITL.
  if (/quota|usage limit/.test(r)) {
    return 'quota';
  }

  // Retries / PR iterations exhausted. Roxy. (Before runtime: both say "exceeded".)
  if (
    /retr(?:y|ies).*(?:exhaust|exceed)|exhaust\w*.*retr|max.*(?:retr|attempt|iteration)\w*.*(?:exceed|reach)|max pr iterations|attempts? exceeded/.test(
      r
    )
  ) {
    return 'retries_exhausted';
  }

  // Runtime / timeout. HITL.
  if (
    /runtime.*exceed|run.?time exceeded|timed? ?out|timeout|deadline exceeded|took too long|execution.*(?:exceed|too long|timed)/.test(
      r
    )
  ) {
    return 'runtime_exceeded';
  }

  // PR review requested changes (either word order). Roxy.
  if (/changes.?requested|requested changes/.test(r)) {
    return 'changes_requested';
  }

  // Git merge conflict. Roxy.
  if (
    /merge conflict|unmerged files|rebase.*conflict|fix conflicts|\bconflict(?:s|ing)?\b/.test(r)
  ) {
    return 'merge_conflict';
  }

  // CI / checks / tests / automated review block. Roxy.
  if (
    /\bci\b|check(?:s)? fail|status check|test(?:s)? fail|build fail|pipeline fail|fresh-eyes review block|automated review|review block/.test(
      r
    )
  ) {
    return 'ci_failure';
  }

  return undefined;
}

/**
 * Map protoMaker's structured `FailureClassifierService` category (persisted on
 * `feature.failureClassification.category` by the lead-engineer ESCALATE path)
 * to the workstacean routing `kind`. Preferred over `deriveBlockedKind`'s prose
 * keyword match when a classification is present — it's a deterministic enum,
 * not a regex on free text (#4069). Returns `undefined` for categories with no
 * precise routing kind so the caller falls back to the reason text, then to the
 * router's remediable default.
 *
 * NOTE: the classifier's `dependency` (a missing npm/module dep that Roxy CAN
 * fix) is deliberately NOT mapped to `dependency_unsatisfied` (feature-DAG
 * upstream gating that the router IGNORES) — mapping it would silently swallow a
 * fixable failure. It falls through to the remediable default instead.
 */
export function failureCategoryToKind(category: string | undefined): BlockedKind | undefined {
  switch (category) {
    case 'rate_limit':
      return 'rate_limit';
    case 'quota':
      return 'quota';
    case 'merge_conflict':
      return 'merge_conflict';
    case 'test_failure':
      return 'ci_failure';
    case 'retry_exhausted':
      return 'retries_exhausted';
    default:
      // transient / validation / tool_error / dependency / authentication /
      // unknown → no precise kind; let the reason-text fallback decide.
      return undefined;
  }
}

/** Subset of the `feature:status-changed` payload this publisher needs. */
interface StatusChangedPayload {
  featureId: string;
  oldStatus?: string;
  newStatus?: string;
  projectPath?: string;
  reason?: string;
}

type PublishFn = (payload: {
  event: string;
  data: Record<string, unknown>;
}) => Promise<{ ok: boolean; error?: string }>;

export class FeatureLifecycleBusPublisher {
  private readonly enabled: boolean;

  constructor(
    private readonly events: Pick<EventEmitter, 'on'>,
    private readonly featureLoader: Pick<FeatureLoader, 'get'>,
    private readonly publishFn: PublishFn = workstaceanPublish,
    enabled: boolean = Boolean(process.env.WORKSTACEAN_URL)
  ) {
    this.enabled = enabled;
  }

  /** Wire up the subscription. No-op (with a debug log) when disabled. */
  start(): void {
    if (!this.enabled) {
      logger.debug('Feature lifecycle bus publishing disabled — WORKSTACEAN_URL not set');
      return;
    }
    this.events.on('feature:status-changed', (payload) => {
      void this.handleStatusChange(payload);
    });
    logger.info('Feature lifecycle bus publishing enabled');
  }

  /**
   * Publish the lifecycle event for a terminal transition:
   *   done → feature.completed, blocked → feature.blocked (kinded),
   *   escalated → feature.failed. Loads the feature fresh to echo its source
   *   signal metadata and PR tracking fields. Never throws — a publish failure
   *   must not affect the board transition.
   */
  async handleStatusChange(payload: StatusChangedPayload): Promise<void> {
    const { featureId, newStatus, oldStatus, projectPath } = payload ?? {};
    if (!featureId || !projectPath || !newStatus) {
      return;
    }

    const isTerminal = TERMINAL_STATUSES.has(newStatus);
    const isBlocked = BLOCKED_STATUSES.has(newStatus);
    const isEscalated = ESCALATED_STATUSES.has(newStatus);
    if (!isTerminal && !isBlocked && !isEscalated) {
      return;
    }

    let feature = null;
    try {
      feature = await this.featureLoader.get(projectPath, featureId);
    } catch (err) {
      logger.warn(`Could not load feature ${featureId} for lifecycle event:`, err);
    }

    // Dotted, unprefixed topics — exactly what workstacean's consumers
    // subscribe to. `blocked` is its own remediable signal; `escalated` stays
    // `feature.failed` (no auto-remediation); `done` is `feature.completed`.
    const topic = isTerminal
      ? 'feature.completed'
      : isBlocked
        ? 'feature.blocked'
        : 'feature.failed';
    const owner = process.env.GITHUB_REPO_OWNER;
    const name = process.env.GITHUB_REPO_NAME;
    const repo = owner && name ? `${owner}/${name}` : undefined;
    // Lineage so consumers correlate to their source record without persisted
    // state. Prefer the echoed manage_feature meta; fall back to intake signal.
    const sourceMeta =
      feature?.sourceMeta && typeof feature.sourceMeta === 'object'
        ? feature.sourceMeta
        : { sourceChannel: feature?.sourceChannel, signalMetadata: feature?.signalMetadata };
    const timestampKey = isTerminal ? 'completedAt' : isBlocked ? 'blockedAt' : 'failedAt';
    const data: Record<string, unknown> = {
      // projectSlug is REQUIRED by workstacean's feature-notifier (resolves the
      // dev channel); fall back so the event is never dropped for lacking it.
      projectSlug: feature?.projectSlug ?? process.env.WORKSTACEAN_PROJECT_SLUG ?? 'protomaker',
      projectPath,
      featureId,
      featureTitle: feature?.title,
      prNumber: feature?.prNumber,
      branchName: feature?.branchName,
      repo,
      previousStatus: oldStatus,
      sourceMeta,
      [timestampKey]: new Date().toISOString(),
    };

    if (isBlocked) {
      // feature.blocked carries the human reason + a kind discriminator the
      // workstacean router uses to pick ignore / HITL / dispatch-Roxy.
      const reason = (feature?.statusChangeReason ?? payload?.reason ?? 'blocked').slice(0, 400);
      data.reason = reason;
      // Prefer the structured classification persisted by the ESCALATE path; it
      // is a deterministic enum rather than a regex over prose. Fall back to the
      // reason-text keyword match (#4069), then to the router's remediable
      // default when neither yields a kind.
      const kind =
        failureCategoryToKind(feature?.failureClassification?.category) ??
        deriveBlockedKind(feature?.statusChangeReason ?? payload?.reason);
      if (kind) {
        data.kind = kind;
      }
    } else if (isEscalated) {
      // feature.failed keeps the historical `error` field for existing consumers.
      data.error = (feature?.statusChangeReason ?? payload?.reason ?? 'failed').slice(0, 400);
    }

    try {
      const result = await this.publishFn({ event: topic, data });
      if (!result.ok) {
        logger.warn(`Failed to publish ${topic} for ${featureId}: ${result.error}`);
      }
    } catch (err) {
      logger.warn(`Error publishing ${topic} for ${featureId}:`, err);
    }
  }
}
