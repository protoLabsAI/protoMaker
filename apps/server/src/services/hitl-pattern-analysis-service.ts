/**
 * HitlPatternAnalysisService
 *
 * Ingests HITL escalation events emitted by Workstacean's pr-remediator
 * (hitl.request.pr.remediation_stuck.{id}) and performs recurring pattern
 * analysis. When the same failure pattern occurs >= OCCURRENCE_THRESHOLD times
 * within a rolling COUNTER_WINDOW_MS window, automatically files a backlog
 * feature on the project board and emits 'hitl:pattern-analysis:feature-filed'.
 *
 * Transport: The service subscribes via TopicBus to
 * 'hitl.request.pr.remediation_stuck.#'. Workstacean events must be published
 * to the TopicBus by the inbound transport layer before this service processes
 * them.
 *
 * Persistence: Escalation records and pattern counters are persisted to
 * {projectPath}/.automaker/ava-memory/hitl-patterns.json using atomic writes.
 * In-memory state is rebuilt from disk on startup (via initialize()).
 *
 * Deduplication: Once a feature is filed for a pattern, filing is suppressed
 * until FILING_DEDUP_WINDOW_MS has elapsed or the filed feature reaches 'done'.
 */

import { randomUUID } from 'node:crypto';
import fs from 'fs/promises';
import { join } from 'node:path';
import { atomicWriteJson, createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from './feature-loader.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('HitlPatternAnalysisService');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of occurrences before a backlog feature is auto-filed */
const OCCURRENCE_THRESHOLD = 3;

/** Sliding window for pattern counters (7 days) */
const COUNTER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** How long to suppress duplicate filings for the same pattern (24 hours) */
const FILING_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Maximum escalation records to retain in persistent store */
const MAX_ESCALATION_RECORDS = 500;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Payload emitted by Workstacean's pr-remediator on
 * hitl.request.pr.remediation_stuck.{id}.
 */
export interface HitlPrRemediationStuckPayload {
  /** GitHub repo (owner/repo) */
  repo: string;
  /** Pull request number */
  prNumber: number;
  /**
   * Remediation kind attempted — e.g. 'merge_conflict', 'ci_failure',
   * 'source_branch_guard', 'test_failure'.
   */
  kind: string;
  /** CI workflow name that failed (e.g. 'checks', 'test', 'build') */
  failingWorkflow: string;
  /** CI status string (e.g. 'failure', 'error', 'timed_out') */
  ciStatus: string;
  /** Number of remediation attempts exhausted */
  attempts: number;
  /** ISO 8601 timestamp when the escalation was emitted */
  timestamp: string;
  /** Snapshot of the last known PR state */
  prState?: Record<string, unknown>;
  /** Log excerpt or error message used to derive error_class */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Internal persistence types
// ---------------------------------------------------------------------------

interface EscalationRecord {
  id: string;
  repo: string;
  prNumber: number;
  kind: string;
  failingWorkflow: string;
  ciStatus: string;
  attempts: number;
  timestamp: string;
  errorClass: string;
  patternSignature: string;
  prState: Record<string, unknown>;
}

interface PatternState {
  signature: string;
  count: number;
  /** ISO 8601 timestamp of the first occurrence in the current window */
  windowStart: string;
  /** Feature ID filed for this pattern, if any */
  filedFeatureId?: string;
  /** ISO 8601 timestamp when the feature was filed */
  filedAt?: string;
}

interface HitlPatternStore {
  escalations: EscalationRecord[];
  patterns: Record<string, PatternState>;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface HitlPatternAnalysisDeps {
  featureLoader: FeatureLoader;
  /** Project path where backlog features will be filed */
  projectPath: string;
  events: EventEmitter;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HitlPatternAnalysisService {
  private readonly deps: HitlPatternAnalysisDeps;

  /** In-memory escalation list (bounded by MAX_ESCALATION_RECORDS) */
  private escalations: EscalationRecord[] = [];

  /** In-memory pattern state map */
  private patterns = new Map<string, PatternState>();

  /** Whether the store has been loaded from disk */
  private initialized = false;

  constructor(deps: HitlPatternAnalysisDeps) {
    this.deps = deps;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Initialize the service by loading persisted state from disk.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.loadStore();
  }

  /**
   * Handle an inbound HITL escalation payload.
   *
   * Called by the TopicBus subscriber when a
   * 'hitl.request.pr.remediation_stuck.*' message arrives.
   */
  async handleEscalation(payload: HitlPrRemediationStuckPayload): Promise<void> {
    if (!this.initialized) await this.initialize();

    const errorClass = extractErrorClass(payload);
    const signature = buildSignature(payload.kind, payload.failingWorkflow, errorClass);

    const record: EscalationRecord = {
      id: randomUUID(),
      repo: payload.repo ?? '',
      prNumber: payload.prNumber ?? 0,
      kind: payload.kind ?? '',
      failingWorkflow: payload.failingWorkflow ?? '',
      ciStatus: payload.ciStatus ?? '',
      attempts: payload.attempts ?? 0,
      timestamp: payload.timestamp ?? new Date().toISOString(),
      errorClass,
      patternSignature: signature,
      prState: payload.prState ?? {},
    };

    this.escalations.push(record);
    // Bound growth
    if (this.escalations.length > MAX_ESCALATION_RECORDS) {
      this.escalations = this.escalations.slice(-MAX_ESCALATION_RECORDS);
    }

    this.deps.events.emit('hitl:pattern-analysis:escalation-ingested', {
      id: record.id,
      repo: record.repo,
      prNumber: record.prNumber,
      patternSignature: signature,
    });

    logger.info(
      `Ingested escalation for ${record.repo}#${record.prNumber} kind=${record.kind} signature="${signature}"`
    );

    await this.updatePatternCounter(signature, record);
    await this.persistStore();
  }

  /**
   * Return active (non-expired) pattern states, sorted by occurrence count descending.
   * Useful for observability / dashboard widgets.
   */
  getPatterns(): PatternState[] {
    const now = Date.now();
    const results: PatternState[] = [];
    for (const state of this.patterns.values()) {
      const windowStart = new Date(state.windowStart).getTime();
      if (!isNaN(windowStart) && now - windowStart <= COUNTER_WINDOW_MS) {
        results.push(state);
      }
    }
    results.sort((a, b) => b.count - a.count);
    return results;
  }

  /**
   * Return recent escalation records (newest-first, bounded to last N).
   */
  getEscalations(limit = 50): EscalationRecord[] {
    return [...this.escalations].reverse().slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async updatePatternCounter(signature: string, record: EscalationRecord): Promise<void> {
    const now = Date.now();
    const existing = this.patterns.get(signature);

    let state: PatternState;
    if (!existing) {
      state = { signature, count: 1, windowStart: new Date(now).toISOString() };
    } else {
      const windowStart = new Date(existing.windowStart).getTime();
      if (isNaN(windowStart) || now - windowStart > COUNTER_WINDOW_MS) {
        // Window expired — start fresh
        state = {
          signature,
          count: 1,
          windowStart: new Date(now).toISOString(),
        };
      } else {
        state = { ...existing, count: existing.count + 1 };
      }
    }

    this.patterns.set(signature, state);

    logger.debug(`Pattern counter updated: signature="${signature}" count=${state.count}`);

    if (state.count >= OCCURRENCE_THRESHOLD) {
      await this.maybeFileFeature(signature, state, record);
    }
  }

  private async maybeFileFeature(
    signature: string,
    state: PatternState,
    latestRecord: EscalationRecord
  ): Promise<void> {
    // Dedup: skip if a feature was filed recently
    if (state.filedAt) {
      const filedAt = new Date(state.filedAt).getTime();
      if (!isNaN(filedAt) && Date.now() - filedAt < FILING_DEDUP_WINDOW_MS) {
        logger.info(
          `Skipping auto-file for pattern="${signature}" — filed recently (${state.filedAt})`
        );
        return;
      }
    }

    // Durable dedup: check feature store for an open feature with the same title
    const title = buildFeatureTitle(signature);
    try {
      const existing = await this.deps.featureLoader.findByTitle(this.deps.projectPath, title);
      if (existing && existing.status !== 'done' && existing.status !== 'interrupted') {
        // Re-populate local dedup guard
        this.patterns.set(signature, {
          ...state,
          filedFeatureId: existing.id,
          filedAt: new Date().toISOString(),
        });
        logger.info(
          `Skipping auto-file for pattern="${signature}" — open feature ${existing.id} already exists (status=${existing.status})`
        );
        return;
      }
    } catch (err) {
      logger.warn(
        `Failed to check for existing feature for pattern="${signature}", proceeding with filing: ${err}`
      );
    }

    // Mark as filed immediately to prevent concurrent duplicates
    this.patterns.set(signature, {
      ...state,
      filedAt: new Date().toISOString(),
    });

    try {
      const description = this.buildFeatureDescription(signature, latestRecord);
      const feature = await this.deps.featureLoader.create(this.deps.projectPath, {
        title,
        description,
        complexity: 'medium',
        status: 'backlog',
        priority: 3,
        category: 'infra',
        tags: ['auto-remediation', 'hitl-pattern', 'self-improvement'],
      } as Parameters<FeatureLoader['create']>[1]);

      // Update pattern state with filed feature ID
      const updated = this.patterns.get(signature)!;
      this.patterns.set(signature, { ...updated, filedFeatureId: feature.id });

      logger.info(
        `Auto-filed feature ${feature.id} for recurring pattern="${signature}" (${state.count} occurrences)`
      );

      this.deps.events.emit('hitl:pattern-analysis:feature-filed', {
        featureId: feature.id,
        patternSignature: signature,
        occurrenceCount: state.count,
        latestRepo: latestRecord.repo,
        latestPrNumber: latestRecord.prNumber,
      });
    } catch (err) {
      // Roll back filing timestamp so a future run can retry
      const rollback = this.patterns.get(signature);
      if (rollback) {
        this.patterns.set(signature, { ...rollback, filedAt: undefined });
      }
      logger.error(`Failed to file feature for pattern="${signature}": ${err}`);
    }
  }

  private buildFeatureDescription(signature: string, latest: EscalationRecord): string {
    const occurrences = this.escalations.filter((e) => e.patternSignature === signature).slice(-5); // Last 5 for evidence

    const evidenceLines = occurrences
      .map(
        (e) =>
          `- ${e.timestamp}: ${e.repo}#${e.prNumber} kind=${e.kind} workflow=${e.failingWorkflow} ci=${e.ciStatus} attempts=${e.attempts}`
      )
      .join('\n');

    const [kind, failingWorkflow, errorClass] = signature.split(':');

    return [
      `This feature was automatically filed by the HITL pattern analysis pipeline.`,
      ``,
      `## Pattern`,
      `- **Signature:** \`${signature}\``,
      `- **Kind:** ${kind}`,
      `- **Failing workflow:** ${failingWorkflow}`,
      `- **Error class:** ${errorClass}`,
      ``,
      `## Root Cause Template`,
      `PRs matching this pattern exhaust the automated remediation retry budget and require manual unblocking.`,
      `Investigate why \`${failingWorkflow}\` fails with error class \`${errorClass}\` for \`${kind}\` remediations`,
      `and implement a durable automated fix so this case never stalls again.`,
      ``,
      `## Recent Evidence (last ${occurrences.length} occurrences)`,
      evidenceLines,
      ``,
      `## Suggested Approach`,
      `1. Review the failing workflow logs for the PRs listed above`,
      `2. Identify the common root cause`,
      `3. Implement an automated handler in the pr-remediator for this case`,
      `4. Add a regression test covering the pattern`,
      ``,
      `**Latest escalation:** ${latest.repo}#${latest.prNumber} at ${latest.timestamp}`,
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private getStorePath(): string {
    return join(this.deps.projectPath, '.automaker', 'ava-memory', 'hitl-patterns.json');
  }

  private async loadStore(): Promise<void> {
    const storePath = this.getStorePath();
    try {
      const raw = await fs.readFile(storePath, 'utf-8');
      const store = JSON.parse(raw) as HitlPatternStore;
      this.escalations = Array.isArray(store.escalations) ? store.escalations : [];
      if (store.patterns && typeof store.patterns === 'object') {
        for (const [key, value] of Object.entries(store.patterns)) {
          this.patterns.set(key, value as PatternState);
        }
      }
      logger.debug(
        `Loaded HITL pattern store: ${this.escalations.length} escalations, ${this.patterns.size} patterns`
      );
    } catch (err: unknown) {
      // ENOENT is expected on first start — any other error is logged as a warning
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`Failed to load HITL pattern store (starting fresh): ${err}`);
      }
    }
  }

  private async persistStore(): Promise<void> {
    const storePath = this.getStorePath();
    const store: HitlPatternStore = {
      escalations: this.escalations,
      patterns: Object.fromEntries(this.patterns),
      lastUpdated: new Date().toISOString(),
    };
    try {
      await atomicWriteJson(storePath, store, { createDirs: true });
    } catch (err) {
      logger.warn(`Failed to persist HITL pattern store: ${err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

/**
 * Extract a coarse error class from the escalation payload.
 *
 * Checks the failingWorkflow name and optional errorMessage for known patterns.
 * Returns 'unknown' when no class can be determined.
 */
function extractErrorClass(payload: HitlPrRemediationStuckPayload): string {
  const text = [payload.failingWorkflow ?? '', payload.errorMessage ?? ''].join(' ').toLowerCase();

  if (/type.?error|typescript|\.ts\b|tsc\b/.test(text)) return 'ts_error';
  if (/test.fail|jest|vitest|spec\b|\.spec\./.test(text)) return 'test_failure';
  if (/\blint\b|eslint|prettier/.test(text)) return 'lint_failure';
  if (/source.branch|wrong.branch|promotion.check|source-branch/.test(text))
    return 'source_branch_guard';
  if (/build.fail|webpack|vite\b|compile/.test(text)) return 'build_failure';

  return 'unknown';
}

/**
 * Build a canonical pattern signature from its three components.
 * Format: `{kind}:{failingWorkflow}:{errorClass}`
 */
function buildSignature(kind: string, failingWorkflow: string, errorClass: string): string {
  return [kind ?? 'unknown', failingWorkflow ?? 'unknown', errorClass].join(':');
}

/**
 * Build the feature title for a given pattern signature.
 */
function buildFeatureTitle(signature: string): string {
  const [kind, failingWorkflow, errorClass] = signature.split(':');
  const humanReadable = [kind, failingWorkflow, errorClass]
    .map((s) => s?.replace(/_/g, ' '))
    .join(' / ');
  return `auto-remediate: stuck on ${humanReadable}`;
}
