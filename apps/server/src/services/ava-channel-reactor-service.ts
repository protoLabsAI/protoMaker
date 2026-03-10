/**
 * AvaChannelReactorService — reactive orchestrator for multi-instance Ava Channel coordination.
 *
 * Subscribes to the CRDT-backed daily-sharded Ava Channel, detects new messages,
 * classifies them through a rule chain, and dispatches responses with three-layer
 * loop prevention: classifier chain, per-thread cooldown, and busy gating.
 *
 * Self-healing: on subscription failure, retries with exponential backoff (5s base, 60s cap).
 */

import type {
  CRDTStore,
  Unsubscribe,
  AvaChannelDocument,
  MetricsDocument,
} from '@protolabsai/crdt';
import type {
  AvaChatMessage,
  AvaChannelReactorSettings,
  CapacityHeartbeat,
  WorkRequest,
  WorkOffer,
  EscalationRequest,
  EscalationOffer,
  EscalationAccept,
  HealthAlert,
  FrictionReport,
  DoraReport,
  PatternResolved,
} from '@protolabsai/types';

import { DEFAULT_AVA_CHANNEL_REACTOR_SETTINGS } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { FrictionTrackerService } from './friction-tracker-service.js';
import type { DoraMetricsService } from './dora-metrics-service.js';
import type { EventEmitter } from '../lib/events.js';
import {
  createClassifierChain,
  runClassifierChain,
  type ClassifierContext,
  type MessageClassifierRule,
  type MessageClassification,
} from './ava-channel-classifiers.js';
import type { AvaChannelService } from './ava-channel-service.js';

const logger = createLogger('AvaChannelReactor');

/** Base delay for exponential backoff on subscription errors */
const RESUBSCRIBE_BASE_MS = 5_000;
/** Maximum delay for exponential backoff */
const RESUBSCRIBE_MAX_MS = 60_000;
/** Capacity heartbeat broadcast interval */
const HEARTBEAT_INTERVAL_MS = 60_000;
/** DORA report broadcast interval (1 hour) */
const DORA_REPORT_INTERVAL_MS = 60 * 60 * 1000;
/** Maximum features to steal per work-steal cycle */
const MAX_STEAL_PER_CYCLE = 2;
/** Memory threshold (%) above which a health_alert is broadcast */
const HEALTH_ALERT_MEMORY_THRESHOLD = 85;
/** CPU threshold (%) above which a health_alert is broadcast */
const HEALTH_ALERT_CPU_THRESHOLD = 90;
/** Duration (ms) to pause work-stealing from a degraded peer */
const HEALTH_ALERT_PAUSE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface ReactorDependencies {
  avaChannelService: AvaChannelService;
  crdtStore: CRDTStore;
  instanceId: string;
  instanceName: string;
  settingsService: {
    getGlobalSettings(): Promise<{ avaChannelReactor?: AvaChannelReactorSettings }>;
  };
  autoModeService?: {
    getCapacityMetrics(): {
      runningAgents: number;
      maxAgents: number;
      backlogCount: number;
      cpuPercent: number;
      ramUsagePercent: number;
    };
  };
  featureLoader?: {
    getAll(
      projectPath: string
    ): Promise<Array<{ id: string; status: string; [key: string]: unknown }>>;
    create(
      projectPath: string,
      data: Record<string, unknown>
    ): Promise<{ id: string; [key: string]: unknown }>;
  };
  projectPath?: string;
  /** Optional: enables friction-tracking self-improvement loop (peer de-duplication) */
  frictionTrackerService?: FrictionTrackerService;
  /** Optional: enables DORA metric computation and broadcast */
  doraMetricsService?: DoraMetricsService;
  /** Optional: EventEmitter for feature lifecycle event subscriptions */
  events?: EventEmitter;
  /** Optional: reactive spawner for triggering agents on incoming requests */
  reactiveSpawnerService?: {
    spawnForMessage(msg: AvaChatMessage): Promise<unknown>;
  };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface ReactorStatus {
  active: boolean;
  enabled: boolean;
  peersCount: number;
  knownMessageCount: number;
  responsesSent: number;
  errorCount: number;
  cooldownThreads: number;
  pendingQueueSize: number;
  /** Number of peer instances currently paused due to health alerts */
  degradedPeerCount: number;
  /** Instance IDs of peers currently in health-alert pause */
  degradedPeers: string[];
  /** Number of escalations originated by this instance awaiting resolution */
  pendingEscalationCount: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AvaChannelReactorService {
  private readonly deps: ReactorDependencies;

  // Subscription state
  private unsubscribe: Unsubscribe | null = null;
  private midnightTimer: ReturnType<typeof setTimeout> | null = null;
  private currentDateKey: string | null = null;

  // Heartbeat timer
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // DORA report timer (hourly)
  private doraReportTimer: ReturnType<typeof setInterval> | null = null;

  // Settings (populated on start)
  private settings: AvaChannelReactorSettings = { ...DEFAULT_AVA_CHANNEL_REACTOR_SETTINGS };

  // Classifier chain (rebuilt when settings change)
  private classifierRules: MessageClassifierRule[] = [];
  private classifierContext: ClassifierContext | null = null;

  // Message tracking
  private readonly knownMessageIds = new Set<string>();

  // Cooldown tracking — keyed by thread root (inReplyTo || messageId)
  private readonly cooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Busy gate
  private isBusy = false;
  private readonly pendingQueue: Array<{
    message: AvaChatMessage;
    classification: MessageClassification;
  }> = [];

  // Metrics
  private responsesSent = 0;
  private errorCount = 0;
  private active = false;

  // Resubscription backoff
  private resubscribeAttempt = 0;
  private resubscribeTimer: ReturnType<typeof setTimeout> | null = null;

  // Health alert pause — set of instanceIds we should not steal work from
  private readonly degradedPeers = new Map<string, ReturnType<typeof setTimeout>>();

  // Escalation tracking — tracks pending escalation_requests we originated
  // keyed by featureId → first-responder instanceId (set after sending accept)
  private readonly pendingEscalations = new Map<string, string>();

  constructor(deps: ReactorDependencies) {
    this.deps = deps;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    const globalSettings = await this.deps.settingsService.getGlobalSettings();
    this.settings = {
      ...DEFAULT_AVA_CHANNEL_REACTOR_SETTINGS,
      ...globalSettings.avaChannelReactor,
    };

    if (!this.settings.enabled) {
      logger.info('Reactor disabled in settings, skipping start');
      return;
    }

    this.rebuildClassifierChain();

    const dateKey = todayDateKey();
    await this.subscribeToShard(dateKey);
    this.scheduleMidnightRotation();

    this.active = true;
    this.startHeartbeat();
    this.startDoraReportTimer();
    this.subscribeToFeatureEvents();
    logger.info(`Reactor started — instance=${this.deps.instanceName} shard=${dateKey}`);
  }

  stop(): void {
    this.teardownSubscription();

    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
      this.midnightTimer = null;
    }

    if (this.resubscribeTimer) {
      clearTimeout(this.resubscribeTimer);
      this.resubscribeTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.doraReportTimer) {
      clearInterval(this.doraReportTimer);
      this.doraReportTimer = null;
    }

    for (const timer of this.cooldownTimers.values()) {
      clearTimeout(timer);
    }
    this.cooldownTimers.clear();

    for (const timer of this.degradedPeers.values()) {
      clearTimeout(timer);
    }
    this.degradedPeers.clear();
    this.pendingEscalations.clear();

    this.knownMessageIds.clear();
    this.pendingQueue.length = 0;
    this.isBusy = false;
    this.active = false;
    this.currentDateKey = null;
    this.resubscribeAttempt = 0;

    logger.info('Reactor stopped');
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  getStatus(): ReactorStatus {
    return {
      active: this.active,
      enabled: this.settings.enabled,
      peersCount: 0,
      knownMessageCount: this.knownMessageIds.size,
      responsesSent: this.responsesSent,
      errorCount: this.errorCount,
      cooldownThreads: this.cooldownTimers.size,
      pendingQueueSize: this.pendingQueue.length,
      degradedPeerCount: this.degradedPeers.size,
      degradedPeers: [...this.degradedPeers.keys()],
      pendingEscalationCount: this.pendingEscalations.size,
    };
  }

  // ---------------------------------------------------------------------------
  // CRDT subscription
  // ---------------------------------------------------------------------------

  private async subscribeToShard(dateKey: string): Promise<void> {
    this.teardownSubscription();
    this.currentDateKey = dateKey;

    try {
      // Hydrate known message IDs from the existing shard so we do not
      // retroactively respond to messages that arrived before the reactor started.
      const handle = await this.deps.crdtStore.getOrCreate<AvaChannelDocument>(
        'ava-channel',
        dateKey,
        { messages: [] }
      );
      const existing = handle.doc();
      if (existing?.messages) {
        for (const msg of existing.messages) {
          this.knownMessageIds.add(msg.id);
        }
      }

      this.unsubscribe = this.deps.crdtStore.subscribe<AvaChannelDocument>(
        'ava-channel',
        dateKey,
        (doc) => this.onShardChange(doc)
      );

      this.resubscribeAttempt = 0;
      logger.debug(
        `Subscribed to shard ${dateKey} (${this.knownMessageIds.size} existing messages)`
      );
    } catch (err) {
      this.errorCount++;
      logger.error(`Failed to subscribe to shard ${dateKey}:`, err);
      this.scheduleResubscription(dateKey);
    }
  }

  private teardownSubscription(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Self-healing resubscription with exponential backoff
  // ---------------------------------------------------------------------------

  private scheduleResubscription(dateKey: string): void {
    if (this.resubscribeTimer) {
      clearTimeout(this.resubscribeTimer);
    }

    const delay = Math.min(
      RESUBSCRIBE_BASE_MS * Math.pow(2, this.resubscribeAttempt),
      RESUBSCRIBE_MAX_MS
    );
    this.resubscribeAttempt++;

    logger.info(
      `Scheduling resubscription to shard ${dateKey} in ${delay}ms (attempt ${this.resubscribeAttempt})`
    );

    this.resubscribeTimer = setTimeout(() => {
      this.resubscribeTimer = null;
      this.subscribeToShard(dateKey).catch((err) => {
        this.errorCount++;
        logger.error('Resubscription failed:', err);
      });
    }, delay);
  }

  // ---------------------------------------------------------------------------
  // Midnight rotation
  // ---------------------------------------------------------------------------

  private scheduleMidnightRotation(): void {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
    }

    const msUntilMidnight = computeMsUntilMidnightUTC();
    this.midnightTimer = setTimeout(() => {
      this.midnightTimer = null;
      this.rotateShard().catch((err) => {
        this.errorCount++;
        logger.error('Midnight shard rotation failed:', err);
      });
    }, msUntilMidnight);

    // Prevent the timer from keeping the process alive
    if (this.midnightTimer.unref) {
      this.midnightTimer.unref();
    }
  }

  private async rotateShard(): Promise<void> {
    const newDateKey = todayDateKey();
    logger.info(`Midnight rotation: ${this.currentDateKey} -> ${newDateKey}`);

    this.knownMessageIds.clear();
    await this.subscribeToShard(newDateKey);
    this.scheduleMidnightRotation();
  }

  // ---------------------------------------------------------------------------
  // CRDT change callback
  // ---------------------------------------------------------------------------

  private onShardChange(doc: Readonly<AvaChannelDocument>): void {
    const messages = doc.messages ?? [];
    for (const message of messages) {
      if (this.knownMessageIds.has(message.id)) continue;
      this.knownMessageIds.add(message.id);

      // Work-steal protocol runs independently of the classifier chain (async, fire-and-forget).
      this.handleWorkStealProtocol(message).catch((err) => {
        this.errorCount++;
        logger.error(`Work-steal protocol error for message ${message.id}:`, err);
      });

      this.processMessage(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Message processing (three-layer loop prevention)
  // ---------------------------------------------------------------------------

  private processMessage(message: AvaChatMessage): void {
    // Layer 1: Classifier chain
    this.refreshClassifierContext();
    const classification = runClassifierChain(
      message,
      this.classifierContext!,
      this.classifierRules
    );

    if (!classification.shouldRespond) {
      logger.debug(`Skipping message ${message.id} — classifier: ${classification.reason}`);
      return;
    }

    // Layer 2: Per-thread cooldown
    const threadKey = message.inReplyTo ?? message.id;
    if (this.cooldownTimers.has(threadKey)) {
      logger.debug(`Skipping message ${message.id} — thread ${threadKey} is in cooldown`);
      return;
    }

    // Layer 3: Busy gate
    if (this.isBusy) {
      this.pendingQueue.push({ message, classification });
      logger.debug(
        `Queued message ${message.id} — reactor busy (queue size: ${this.pendingQueue.length})`
      );
      return;
    }

    this.dispatchResponse(message, classification);
  }

  // ---------------------------------------------------------------------------
  // Response dispatch
  // ---------------------------------------------------------------------------

  private dispatchResponse(message: AvaChatMessage, classification: MessageClassification): void {
    this.isBusy = true;

    const conversationDepth = (message.conversationDepth ?? 0) + 1;

    if (classification.type === 'request' && this.deps.reactiveSpawnerService) {
      // Post a brief acknowledgment first so the sender knows we received the request.
      this.deps.avaChannelService
        .postMessage('Working on it...', 'ava', {
          intent: 'response',
          expectsResponse: false,
          context: {
            featureId: message.context?.featureId,
          },
        })
        .then(() => {
          logger.debug(
            `Posted acknowledgment for request message ${message.id}, spawning agent...`
          );
          return this.deps.reactiveSpawnerService!.spawnForMessage(message);
        })
        .then((result) => {
          if (result && (result as { spawned?: boolean }).spawned) {
            logger.info(
              `[dispatchResponse] Successfully spawned session for message ${message.id} ` +
                `(type=${classification.type}, depth=${conversationDepth})`
            );
          } else {
            const skippedReason = result && (result as { skippedReason?: string }).skippedReason;
            logger.debug(
              `[dispatchResponse] Spawn skipped for message ${message.id}: reason=${skippedReason ?? 'unknown'}`
            );
          }
          this.responsesSent++;
          this.setCooldown(message.inReplyTo ?? message.id);
        })
        .catch((err) => {
          this.errorCount++;
          logger.error(`Failed to handle request message ${message.id}:`, err);
        })
        .finally(() => {
          this.isBusy = false;
          this.drainPendingQueue();
        });
    } else {
      const responseContent = `[Reactor/${classification.type}] Acknowledged from ${this.deps.instanceName}`;

      this.deps.avaChannelService
        .postMessage(responseContent, 'ava', {
          intent: 'response',
          expectsResponse: false,
          context: {
            featureId: message.context?.featureId,
          },
        })
        .then((posted) => {
          // The postMessage API does not accept inReplyTo/conversationDepth via
          // PostMessageOptions, so the response is posted as a standalone message.
          // Future: extend PostMessageOptions if threaded replies are needed.
          logger.debug(
            `Dispatched response ${posted.id} for message ${message.id} ` +
              `(type=${classification.type}, depth=${conversationDepth})`
          );

          this.responsesSent++;
          this.setCooldown(message.inReplyTo ?? message.id);
        })
        .catch((err) => {
          this.errorCount++;
          logger.error(`Failed to dispatch response for message ${message.id}:`, err);
        })
        .finally(() => {
          this.isBusy = false;
          this.drainPendingQueue();
        });
    }
  }

  // ---------------------------------------------------------------------------
  // Cooldown management
  // ---------------------------------------------------------------------------

  private setCooldown(threadKey: string): void {
    // Clear any existing cooldown timer for this thread
    const existing = this.cooldownTimers.get(threadKey);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.cooldownTimers.delete(threadKey);
    }, this.settings.cooldownMs);

    // Prevent cooldown timers from keeping the process alive
    if (timer.unref) timer.unref();

    this.cooldownTimers.set(threadKey, timer);
  }

  // ---------------------------------------------------------------------------
  // Pending queue drain
  // ---------------------------------------------------------------------------

  private drainPendingQueue(): void {
    if (this.isBusy || this.pendingQueue.length === 0) return;

    const next = this.pendingQueue.shift();
    if (!next) return;

    // Re-evaluate cooldown — the thread may have entered cooldown while queued
    const threadKey = next.message.inReplyTo ?? next.message.id;
    if (this.cooldownTimers.has(threadKey)) {
      logger.debug(
        `Dequeued message ${next.message.id} skipped — thread ${threadKey} now in cooldown`
      );
      this.drainPendingQueue();
      return;
    }

    this.dispatchResponse(next.message, next.classification);
  }

  // ---------------------------------------------------------------------------
  // Classifier chain helpers
  // ---------------------------------------------------------------------------

  private rebuildClassifierChain(): void {
    const { rules, context } = createClassifierChain(this.deps.instanceId, {
      maxConversationDepth: this.settings.maxConversationDepth,
      staleThresholdMs: this.settings.staleMessageThresholdMs,
      ...this.getCapacitySnapshot(),
    });
    this.classifierRules = rules;
    this.classifierContext = context;
  }

  /**
   * Refresh the mutable fields on the classifier context (capacity metrics)
   * without rebuilding the entire chain.
   */
  private refreshClassifierContext(): void {
    if (!this.classifierContext) {
      this.rebuildClassifierChain();
      return;
    }

    const capacity = this.getCapacitySnapshot();
    this.classifierContext.runningAgents = capacity.runningAgents;
    this.classifierContext.maxAgents = capacity.maxAgents;
  }

  private getCapacitySnapshot(): { runningAgents: number; maxAgents: number } {
    if (this.deps.autoModeService) {
      const metrics = this.deps.autoModeService.getCapacityMetrics();
      return { runningAgents: metrics.runningAgents, maxAgents: metrics.maxAgents };
    }
    return { runningAgents: 0, maxAgents: 5 };
  }

  // ---------------------------------------------------------------------------
  // Capacity heartbeat broadcasting
  // ---------------------------------------------------------------------------

  /**
   * Start the 60-second capacity heartbeat broadcast interval.
   * Each broadcast posts a capacity_heartbeat system message to the Ava Channel.
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.broadcastCapacityHeartbeat().catch((err) => {
        this.errorCount++;
        logger.error('Failed to broadcast capacity heartbeat:', err);
      });
    }, HEARTBEAT_INTERVAL_MS);

    // Prevent heartbeat timer from keeping the process alive
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }

    logger.debug(`Heartbeat timer started (interval=${HEARTBEAT_INTERVAL_MS}ms)`);
  }

  private async broadcastCapacityHeartbeat(): Promise<void> {
    const metrics = this.deps.autoModeService?.getCapacityMetrics();

    const heartbeat: CapacityHeartbeat = {
      instanceId: this.deps.instanceId,
      role: this.deps.instanceName,
      backlogCount: metrics?.backlogCount ?? 0,
      activeCount: metrics?.runningAgents ?? 0,
      maxConcurrency: metrics?.maxAgents ?? 5,
      cpuLoad: metrics?.cpuPercent ?? 0,
      memoryUsed: metrics?.ramUsagePercent ?? 0,
    };

    await this.deps.avaChannelService.postMessage(
      `[capacity_heartbeat] ${JSON.stringify(heartbeat)}`,
      'system',
      {
        intent: 'inform',
        expectsResponse: false,
      }
    );

    logger.debug(
      `Broadcast capacity_heartbeat: activeCount=${heartbeat.activeCount} backlogCount=${heartbeat.backlogCount}`
    );

    // Broadcast health_alert if thresholds are exceeded
    if (
      heartbeat.memoryUsed > HEALTH_ALERT_MEMORY_THRESHOLD ||
      heartbeat.cpuLoad > HEALTH_ALERT_CPU_THRESHOLD
    ) {
      await this.broadcastHealthAlert(heartbeat.memoryUsed, heartbeat.cpuLoad);
    }
  }

  // ---------------------------------------------------------------------------
  // Work-steal message handlers (work_request / work_offer)
  // ---------------------------------------------------------------------------

  /**
   * Inspect a newly-seen message and trigger work-steal protocol if applicable.
   * Called alongside the classifier chain in processMessage for system-level messages.
   *
   * - capacity_heartbeat from peer with backlog + local activeCount==0 → send work_request
   * - work_request targeting this instance → send work_offer
   * - work_offer targeting this instance → create stolen features locally
   */
  private async handleWorkStealProtocol(message: AvaChatMessage): Promise<void> {
    if (message.source !== 'system') return;

    // capacity_heartbeat handler
    if (message.content.startsWith('[capacity_heartbeat]')) {
      await this.onCapacityHeartbeat(message);
      return;
    }

    // work_request handler
    if (message.content.startsWith('[work_request]')) {
      await this.onWorkRequest(message);
      return;
    }

    // work_offer handler
    if (message.content.startsWith('[work_offer]')) {
      await this.onWorkOffer(message);
      return;
    }

    // escalation_request handler
    if (message.content.startsWith('[escalation_request]')) {
      await this.onEscalationRequest(message);
      return;
    }

    // escalation_offer handler
    if (message.content.startsWith('[escalation_offer]')) {
      await this.onEscalationOffer(message);
      return;
    }

    // escalation_accept handler
    if (message.content.startsWith('[escalation_accept]')) {
      await this.onEscalationAccept(message);
      return;
    }

    // health_alert handler
    if (message.content.startsWith('[health_alert]')) {
      await this.onHealthAlert(message);
      return;
    }

    // friction_report handler (peer de-duplication)
    if (message.content.startsWith('[friction_report]')) {
      this.onFrictionReport(message);
      return;
    }

    // pattern_resolved handler — clear counters for the resolved pattern
    if (message.content.startsWith('[pattern_resolved]')) {
      this.onPatternResolved(message);
      return;
    }

    // dora_report handler — merge peer metrics into CRDTStore aggregate
    if (message.content.startsWith('[dora_report]')) {
      await this.onDoraReport(message);
      return;
    }
  }

  private async onCapacityHeartbeat(message: AvaChatMessage): Promise<void> {
    // Ignore self
    if (message.instanceId === this.deps.instanceId) return;

    let heartbeat: CapacityHeartbeat;
    try {
      const json = message.content.replace('[capacity_heartbeat]', '').trim();
      heartbeat = JSON.parse(json) as CapacityHeartbeat;
    } catch {
      logger.warn('Received malformed capacity_heartbeat, ignoring');
      return;
    }

    // Only steal if: peer has backlog AND we are idle (activeCount == 0)
    // AND the peer is not in a degraded/health-alert state
    const localMetrics = this.deps.autoModeService?.getCapacityMetrics();
    const localActive = localMetrics?.runningAgents ?? 0;

    if (this.degradedPeers.has(heartbeat.instanceId)) {
      logger.debug(
        `Skipping work-steal from ${heartbeat.instanceId} — peer is in health-alert pause`
      );
      return;
    }

    if (heartbeat.backlogCount > 0 && localActive === 0) {
      logger.info(
        `Peer ${heartbeat.instanceId} has backlog=${heartbeat.backlogCount} and we are idle — sending work_request`
      );
      await this.sendWorkRequest(heartbeat.instanceId);
    }
  }

  private async sendWorkRequest(targetInstanceId: string): Promise<void> {
    const request: WorkRequest = {
      requestingInstanceId: this.deps.instanceId,
      targetInstanceId,
      maxFeatures: MAX_STEAL_PER_CYCLE,
    };

    await this.deps.avaChannelService.postMessage(
      `[work_request] ${JSON.stringify(request)}`,
      'system',
      {
        intent: 'request',
        expectsResponse: true,
      }
    );

    logger.debug(`Sent work_request to ${targetInstanceId} (max=${MAX_STEAL_PER_CYCLE} features)`);
  }

  private async onWorkRequest(message: AvaChatMessage): Promise<void> {
    // Ignore self
    if (message.instanceId === this.deps.instanceId) return;

    let request: WorkRequest;
    try {
      const json = message.content.replace('[work_request]', '').trim();
      request = JSON.parse(json) as WorkRequest;
    } catch {
      logger.warn('Received malformed work_request, ignoring');
      return;
    }

    // Only respond if we are the intended target
    if (request.targetInstanceId !== this.deps.instanceId) return;

    if (!this.deps.featureLoader || !this.deps.projectPath) {
      logger.warn('work_request received but featureLoader/projectPath not configured — skipping');
      return;
    }

    // Find unblocked backlog features — exclude epics (container-only, not implementable)
    const allFeatures = await this.deps.featureLoader.getAll(this.deps.projectPath);
    const backlogFeatures = allFeatures
      .filter(
        (f) =>
          f.status === 'backlog' &&
          !(f as Record<string, unknown>).claimedBy &&
          !(f as Record<string, unknown>).isEpic
      )
      .slice(0, Math.min(request.maxFeatures, MAX_STEAL_PER_CYCLE));

    if (backlogFeatures.length === 0) {
      logger.debug(
        `work_request from ${request.requestingInstanceId}: no available backlog features to offer`
      );
      return;
    }

    const offer: WorkOffer = {
      offeringInstanceId: this.deps.instanceId,
      requestingInstanceId: request.requestingInstanceId,
      featureIds: backlogFeatures.map((f) => f.id as string),
      features: backlogFeatures as Record<string, unknown>[],
    };

    await this.deps.avaChannelService.postMessage(
      `[work_offer] ${JSON.stringify(offer)}`,
      'system',
      {
        intent: 'response',
        expectsResponse: false,
      }
    );

    logger.info(
      `Sent work_offer to ${request.requestingInstanceId} with ${offer.featureIds.length} features: ${offer.featureIds.join(', ')}`
    );
  }

  private async onWorkOffer(message: AvaChatMessage): Promise<void> {
    // Ignore self
    if (message.instanceId === this.deps.instanceId) return;

    let offer: WorkOffer;
    try {
      const json = message.content.replace('[work_offer]', '').trim();
      offer = JSON.parse(json) as WorkOffer;
    } catch {
      logger.warn('Received malformed work_offer, ignoring');
      return;
    }

    // Only process if we are the intended recipient
    if (offer.requestingInstanceId !== this.deps.instanceId) return;

    if (!this.deps.featureLoader || !this.deps.projectPath) {
      logger.warn('work_offer received but featureLoader/projectPath not configured — skipping');
      return;
    }

    // Cap at MAX_STEAL_PER_CYCLE to prevent thundering herd
    const featuresToCreate = offer.features.slice(0, MAX_STEAL_PER_CYCLE);

    // Dedup: check which features already exist locally (by branchName or stolenFromFeatureId)
    const existingFeatures = await this.deps.featureLoader.getAll(this.deps.projectPath);
    const existingBranches = new Set(
      existingFeatures.map((f) => (f as Record<string, unknown>).branchName).filter(Boolean)
    );
    const existingStolenIds = new Set(
      existingFeatures
        .map((f) => (f as Record<string, unknown>).stolenFromFeatureId)
        .filter(Boolean)
    );

    const newFeatures = featuresToCreate.filter((fd) => {
      const data = fd as Record<string, unknown>;
      if (data.branchName && existingBranches.has(data.branchName)) return false;
      if (data.id && existingStolenIds.has(data.id)) return false;
      if (data.isEpic) return false;
      return true;
    });

    if (newFeatures.length === 0) {
      logger.debug(
        `work_offer from ${offer.offeringInstanceId}: all ${featuresToCreate.length} features already exist locally — skipping`
      );
      return;
    }

    logger.info(
      `Received work_offer from ${offer.offeringInstanceId} — creating ${newFeatures.length} features locally (${featuresToCreate.length - newFeatures.length} skipped as duplicates)`
    );

    for (const featureData of newFeatures) {
      try {
        // Strip the original ID so create() generates a new one for this instance
        const { id: _originalId, ...rest } = featureData as { id: string; [key: string]: unknown };
        const created = await this.deps.featureLoader.create(this.deps.projectPath, {
          ...rest,
          status: 'backlog',
          stolenFromInstanceId: offer.offeringInstanceId,
          stolenFromFeatureId: _originalId,
        });
        logger.info(`Stolen feature created locally: ${created.id} (original: ${_originalId})`);
      } catch (err) {
        this.errorCount++;
        logger.error(`Failed to create stolen feature from offer:`, err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Escalation protocol handlers
  // ---------------------------------------------------------------------------

  /**
   * Post an escalation_request when a feature hits blocked status with failureCount >= 2.
   * Called by external code (e.g., feature status watcher) when these conditions are met.
   */
  async postEscalationRequest(opts: {
    featureId: string;
    failureCount: number;
    lastError: string;
    worktreeState: string;
    featureData: Record<string, unknown>;
  }): Promise<void> {
    if (opts.failureCount < 2) return;

    const payload: EscalationRequest = {
      featureId: opts.featureId,
      failureCount: opts.failureCount,
      lastError: opts.lastError,
      worktreeState: opts.worktreeState,
      originatingInstanceId: this.deps.instanceId,
    };

    await this.deps.avaChannelService.postMessage(
      `[escalation_request] ${JSON.stringify({ ...payload, featureData: opts.featureData })}`,
      'system',
      {
        intent: 'escalation',
        expectsResponse: true,
        context: { featureId: opts.featureId },
      }
    );

    logger.info(
      `Posted escalation_request for feature ${opts.featureId} (failureCount=${opts.failureCount})`
    );
  }

  /**
   * Handle an incoming escalation_request from a peer.
   * If this instance has idle capacity, respond with an escalation_offer.
   */
  private async onEscalationRequest(message: AvaChatMessage): Promise<void> {
    // Ignore self
    if (message.instanceId === this.deps.instanceId) return;

    let payload: EscalationRequest & { featureData?: Record<string, unknown> };
    try {
      const json = message.content.replace('[escalation_request]', '').trim();
      payload = JSON.parse(json) as EscalationRequest & { featureData?: Record<string, unknown> };
    } catch {
      logger.warn('Received malformed escalation_request, ignoring');
      return;
    }

    // Only respond if we have idle capacity
    const localMetrics = this.deps.autoModeService?.getCapacityMetrics();
    const localActive = localMetrics?.runningAgents ?? 0;
    const localMax = localMetrics?.maxAgents ?? 5;

    if (localActive >= localMax) {
      logger.debug(
        `Received escalation_request for ${payload.featureId} but we are at capacity — skipping offer`
      );
      return;
    }

    const offerPayload: EscalationOffer = {
      offeringInstanceId: this.deps.instanceId,
      originatingInstanceId: payload.originatingInstanceId,
      featureId: payload.featureId,
    };

    await this.deps.avaChannelService.postMessage(
      `[escalation_offer] ${JSON.stringify(offerPayload)}`,
      'system',
      {
        intent: 'response',
        expectsResponse: false,
        context: { featureId: payload.featureId },
      }
    );

    logger.info(
      `Sent escalation_offer for feature ${payload.featureId} to ${payload.originatingInstanceId}`
    );
  }

  /**
   * Handle an incoming escalation_offer from a peer.
   * Accept the first offer by posting an escalation_accept with full feature data.
   */
  private async onEscalationOffer(message: AvaChatMessage): Promise<void> {
    // Ignore self
    if (message.instanceId === this.deps.instanceId) return;

    let offer: EscalationOffer;
    try {
      const json = message.content.replace('[escalation_offer]', '').trim();
      offer = JSON.parse(json) as EscalationOffer;
    } catch {
      logger.warn('Received malformed escalation_offer, ignoring');
      return;
    }

    // Only process if we are the originating instance
    if (offer.originatingInstanceId !== this.deps.instanceId) return;

    // Ignore if already accepted an offer for this feature
    if (this.pendingEscalations.has(offer.featureId)) {
      logger.debug(
        `Received escalation_offer for ${offer.featureId} from ${offer.offeringInstanceId} but already accepted another offer — ignoring`
      );
      return;
    }

    // Mark this feature as delegated
    this.pendingEscalations.set(offer.featureId, offer.offeringInstanceId);

    // Retrieve full feature data to send
    let featureData: Record<string, unknown> = {};
    if (this.deps.featureLoader && this.deps.projectPath) {
      try {
        const allFeatures = await this.deps.featureLoader.getAll(this.deps.projectPath);
        const feature = allFeatures.find((f) => f.id === offer.featureId);
        if (feature) {
          featureData = feature as Record<string, unknown>;
        }
      } catch (err) {
        logger.warn(`Failed to load feature data for escalation_accept: ${err}`);
      }
    }

    const acceptPayload: EscalationAccept = {
      acceptingInstanceId: offer.offeringInstanceId,
      originatingInstanceId: this.deps.instanceId,
      featureId: offer.featureId,
      featureData,
    };

    await this.deps.avaChannelService.postMessage(
      `[escalation_accept] ${JSON.stringify(acceptPayload)}`,
      'system',
      {
        intent: 'coordination',
        expectsResponse: false,
        context: { featureId: offer.featureId },
      }
    );

    logger.info(
      `Sent escalation_accept for feature ${offer.featureId} to ${offer.offeringInstanceId}`
    );
  }

  /**
   * Handle an incoming escalation_accept from the originating instance.
   * Clone the feature onto this instance's board with escalated complexity.
   */
  private async onEscalationAccept(message: AvaChatMessage): Promise<void> {
    // Ignore self
    if (message.instanceId === this.deps.instanceId) return;

    let accept: EscalationAccept;
    try {
      const json = message.content.replace('[escalation_accept]', '').trim();
      accept = JSON.parse(json) as EscalationAccept;
    } catch {
      logger.warn('Received malformed escalation_accept, ignoring');
      return;
    }

    // Only process if we are the accepting instance
    if (accept.acceptingInstanceId !== this.deps.instanceId) return;

    if (!this.deps.featureLoader || !this.deps.projectPath) {
      logger.warn('escalation_accept received but featureLoader/projectPath not configured');
      return;
    }

    // Determine escalated complexity
    const originalComplexity = (accept.featureData.complexity as string) ?? 'medium';
    const escalatedComplexity =
      originalComplexity === 'large' || originalComplexity === 'architectural'
        ? 'architectural'
        : 'large';

    try {
      const { id: _originalId, ...rest } = accept.featureData as {
        id: string;
        [key: string]: unknown;
      };
      const created = await this.deps.featureLoader.create(this.deps.projectPath, {
        ...rest,
        status: 'backlog',
        complexity: escalatedComplexity,
        escalatedFromInstanceId: accept.originatingInstanceId,
        escalatedFromFeatureId: _originalId ?? accept.featureId,
      });
      logger.info(
        `Escalated feature created locally: ${created.id} (original: ${accept.featureId}, complexity: ${escalatedComplexity})`
      );
    } catch (err) {
      this.errorCount++;
      logger.error(`Failed to create escalated feature:`, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Health alert handlers
  // ---------------------------------------------------------------------------

  /**
   * Broadcast a health_alert when memory or CPU thresholds are exceeded.
   * Called by the broadcastCapacityHeartbeat when thresholds are breached.
   */
  private async broadcastHealthAlert(memoryUsed: number, cpuLoad: number): Promise<void> {
    const alert: HealthAlert = {
      instanceId: this.deps.instanceId,
      memoryUsed,
      cpuLoad,
      alertTimestamp: new Date().toISOString(),
    };

    await this.deps.avaChannelService.postMessage(
      `[health_alert] ${JSON.stringify(alert)}`,
      'system',
      {
        intent: 'system_alert',
        expectsResponse: false,
      }
    );

    logger.warn(`Broadcast health_alert: memoryUsed=${memoryUsed}% cpuLoad=${cpuLoad}%`);
  }

  /**
   * Handle an incoming health_alert from a peer.
   * Pause work-stealing from the degraded instance for 5 minutes.
   */
  private async onHealthAlert(message: AvaChatMessage): Promise<void> {
    // Ignore self
    if (message.instanceId === this.deps.instanceId) return;

    let alert: HealthAlert;
    try {
      const json = message.content.replace('[health_alert]', '').trim();
      alert = JSON.parse(json) as HealthAlert;
    } catch {
      logger.warn('Received malformed health_alert, ignoring');
      return;
    }

    // Clear any existing pause timer for this peer
    const existing = this.degradedPeers.get(alert.instanceId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.degradedPeers.delete(alert.instanceId);
      logger.info(`Health-alert pause expired for peer ${alert.instanceId}`);
    }, HEALTH_ALERT_PAUSE_MS);

    if (timer.unref) timer.unref();
    this.degradedPeers.set(alert.instanceId, timer);

    logger.warn(
      `Pausing work-steal from ${alert.instanceId} for ${HEALTH_ALERT_PAUSE_MS / 1000}s ` +
        `(memoryUsed=${alert.memoryUsed}% cpuLoad=${alert.cpuLoad}%)`
    );
  }

  // ---------------------------------------------------------------------------
  // Friction report handlers
  // ---------------------------------------------------------------------------

  private onFrictionReport(message: AvaChatMessage): void {
    // Ignore self
    if (message.instanceId === this.deps.instanceId) return;

    if (!this.deps.frictionTrackerService) return;

    let report: FrictionReport;
    try {
      const json = message.content.replace('[friction_report]', '').trim();
      report = JSON.parse(json) as FrictionReport;
    } catch {
      logger.warn('Received malformed friction_report, ignoring');
      return;
    }

    this.deps.frictionTrackerService.handlePeerReport(report);
    logger.debug(
      `Processed peer friction_report: pattern="${report.pattern}" from instance=${report.instanceId}`
    );
  }

  // ---------------------------------------------------------------------------
  // Pattern resolved handler
  // ---------------------------------------------------------------------------

  /**
   * Handle an incoming pattern_resolved message from a peer.
   * Clears the friction counter and dedup entry for the resolved pattern.
   */
  private onPatternResolved(message: AvaChatMessage): void {
    // Ignore self (we already resolved it locally)
    if (message.instanceId === this.deps.instanceId) return;

    if (!this.deps.frictionTrackerService) return;

    let payload: PatternResolved;
    try {
      const json = message.content.replace('[pattern_resolved]', '').trim();
      payload = JSON.parse(json) as PatternResolved;
    } catch {
      logger.warn('Received malformed pattern_resolved, ignoring');
      return;
    }

    this.deps.frictionTrackerService.resolvePattern(payload.pattern);
    logger.debug(
      `Processed peer pattern_resolved: pattern="${payload.pattern}" from instance=${payload.instanceId}`
    );
  }

  /**
   * Broadcast a pattern_resolved message to the backchannel.
   * Called when a System Improvement feature moves to done on this instance.
   */
  private async broadcastPatternResolved(pattern: string, featureId: string): Promise<void> {
    const payload: PatternResolved = {
      pattern,
      featureId,
      instanceId: this.deps.instanceId,
      resolvedAt: new Date().toISOString(),
    };

    try {
      await this.deps.avaChannelService.postMessage(
        `[pattern_resolved] ${JSON.stringify(payload)}`,
        'system',
        {
          intent: 'inform',
          expectsResponse: false,
        }
      );
      logger.info(`Broadcast pattern_resolved for pattern="${pattern}" featureId=${featureId}`);
    } catch (err) {
      logger.error(`Failed to broadcast pattern_resolved for pattern="${pattern}":`, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Feature event subscription (System Improvement → done)
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to feature:status-changed events.
   * When a System Improvement feature moves to done, resolve its pattern
   * in FrictionTrackerService and broadcast pattern_resolved to peers.
   */
  private subscribeToFeatureEvents(): void {
    if (!this.deps.events) return;

    this.deps.events.on('feature:status-changed', (payload) => {
      const { newStatus, feature } = payload as {
        newStatus?: string;
        feature?: {
          id?: string;
          systemImprovement?: boolean;
          title?: string;
          tags?: string[];
        };
      };

      if (newStatus !== 'done') return;
      if (!feature?.systemImprovement) return;

      // Extract pattern from the feature title
      // Title format: "System Improvement: recurring <pattern> failures"
      const title = feature.title ?? '';
      const match = title.match(/recurring (.+?) failures/);
      const pattern = match?.[1] ?? '';

      if (!pattern) return;

      // Clear local friction counter
      if (this.deps.frictionTrackerService) {
        this.deps.frictionTrackerService.resolvePattern(pattern);
      }

      // Broadcast to peers
      this.broadcastPatternResolved(pattern, feature.id ?? '').catch((err) => {
        this.errorCount++;
        logger.error(`Failed to broadcast pattern_resolved for pattern="${pattern}":`, err);
      });
    });

    logger.debug('Subscribed to feature:status-changed for System Improvement resolution');
  }

  // ---------------------------------------------------------------------------
  // DORA report broadcast (hourly)
  // ---------------------------------------------------------------------------

  /**
   * Start the hourly DORA report broadcast timer.
   */
  private startDoraReportTimer(): void {
    if (!this.deps.doraMetricsService || !this.deps.projectPath) return;

    if (this.doraReportTimer) {
      clearInterval(this.doraReportTimer);
    }

    this.doraReportTimer = setInterval(() => {
      this.broadcastDoraReport().catch((err) => {
        this.errorCount++;
        logger.error('Failed to broadcast dora_report:', err);
      });
    }, DORA_REPORT_INTERVAL_MS);

    if (this.doraReportTimer.unref) {
      this.doraReportTimer.unref();
    }

    logger.debug(`DORA report timer started (interval=${DORA_REPORT_INTERVAL_MS}ms)`);
  }

  private async broadcastDoraReport(): Promise<void> {
    if (!this.deps.doraMetricsService || !this.deps.projectPath) return;

    const metrics = await this.deps.doraMetricsService.getMetrics(this.deps.projectPath, 1);

    const report: DoraReport = {
      instanceId: this.deps.instanceId,
      computedAt: new Date().toISOString(),
      deploymentsLast24h: metrics.deploymentFrequency.value,
      avgLeadTimeMs: metrics.leadTime.value * 60 * 60 * 1000, // convert hours → ms
      blockedCount: 0, // computed as blocked ratio * done count
      doneCount: Math.round(metrics.deploymentFrequency.value * 1),
    };

    await this.deps.avaChannelService.postMessage(
      `[dora_report] ${JSON.stringify(report)}`,
      'system',
      {
        intent: 'inform',
        expectsResponse: false,
      }
    );

    // Also store locally in CRDTStore
    await this.storeDoraCrdtEntry(report);

    logger.debug(
      `Broadcast dora_report: deploymentsLast24h=${report.deploymentsLast24h} avgLeadTimeMs=${report.avgLeadTimeMs}`
    );
  }

  // ---------------------------------------------------------------------------
  // DORA report peer message handler
  // ---------------------------------------------------------------------------

  /**
   * Handle an incoming dora_report from a peer instance.
   * Merge the peer's metrics into the aggregate CRDTStore entry.
   */
  private async onDoraReport(message: AvaChatMessage): Promise<void> {
    // Process reports from all instances (including self for local storage)
    let report: DoraReport;
    try {
      const json = message.content.replace('[dora_report]', '').trim();
      report = JSON.parse(json) as DoraReport;
    } catch {
      logger.warn('Received malformed dora_report, ignoring');
      return;
    }

    await this.storeDoraCrdtEntry(report);
    logger.debug(`Merged dora_report from instance=${report.instanceId} into CRDTStore aggregate`);
  }

  /**
   * Upsert a single instance's DORA report into the CRDTStore aggregate document
   * at domain='metrics', id='dora'.
   */
  private async storeDoraCrdtEntry(report: DoraReport): Promise<void> {
    try {
      await this.deps.crdtStore.change<MetricsDocument>('metrics', 'dora', (doc) => {
        if (!doc.instanceReports) {
          (
            doc as unknown as { instanceReports: MetricsDocument['instanceReports'] }
          ).instanceReports = {};
        }
        doc.instanceReports[report.instanceId] = {
          computedAt: report.computedAt,
          deploymentsLast24h: report.deploymentsLast24h,
          avgLeadTimeMs: report.avgLeadTimeMs,
          blockedCount: report.blockedCount,
          doneCount: report.doneCount,
        };
        doc.updatedAt = new Date().toISOString();
      });
    } catch (err) {
      logger.error(`Failed to store dora_report in CRDTStore:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

/** Get today's UTC date as YYYY-MM-DD. */
function todayDateKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Compute milliseconds from now until next midnight UTC. */
function computeMsUntilMidnightUTC(): number {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return tomorrow.getTime() - now.getTime();
}
