/**
 * AvaChannelReactorService — reactive orchestrator for multi-instance Ava Channel coordination.
 *
 * Subscribes to the CRDT-backed daily-sharded Ava Channel, detects new messages,
 * classifies them through a rule chain, and dispatches responses with three-layer
 * loop prevention: classifier chain, per-thread cooldown, and busy gating.
 *
 * Self-healing: on subscription failure, retries with exponential backoff (5s base, 60s cap).
 */

import type { CRDTStore, Unsubscribe, AvaChannelDocument } from '@protolabsai/crdt';
import type {
  AvaChatMessage,
  AvaChannelReactorSettings,
  CapacityHeartbeat,
  WorkRequest,
  WorkOffer,
} from '@protolabsai/types';
import { DEFAULT_AVA_CHANNEL_REACTOR_SETTINGS } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
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
/** Maximum features to steal per work-steal cycle */
const MAX_STEAL_PER_CYCLE = 2;

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

    for (const timer of this.cooldownTimers.values()) {
      clearTimeout(timer);
    }
    this.cooldownTimers.clear();

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

    const responseContent = `[Reactor/${classification.type}] Acknowledged from ${this.deps.instanceName}`;
    const conversationDepth = (message.conversationDepth ?? 0) + 1;

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
    const localMetrics = this.deps.autoModeService?.getCapacityMetrics();
    const localActive = localMetrics?.runningAgents ?? 0;

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

    // Find unblocked backlog features
    const allFeatures = await this.deps.featureLoader.getAll(this.deps.projectPath);
    const backlogFeatures = allFeatures
      .filter((f) => f.status === 'backlog' && !(f as Record<string, unknown>).claimedBy)
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

    logger.info(
      `Received work_offer from ${offer.offeringInstanceId} — creating ${featuresToCreate.length} features locally`
    );

    for (const featureData of featuresToCreate) {
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
