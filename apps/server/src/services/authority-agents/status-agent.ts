/**
 * Status Monitor Agent - Blocker Detection & Escalation
 *
 * Sub-agent of ProjM that monitors in-progress features for:
 * - Failed features (error state for too long)
 * - Stale features (in_progress with no activity)
 * - Dependency deadlocks (circular or unresolvable)
 *
 * When issues are detected, submits escalation proposals through
 * the authority service, which routes to CTO for resolution.
 */

import type { Feature } from '@automaker/types';
import type { AuthorityAgent } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import { createAgentState, initializeAgent, type AgentState } from './agent-utils.js';

const logger = createLogger('StatusAgent');

/** How often to scan for blockers */
const SCAN_INTERVAL_MS = 30_000;

/** Feature is stale if in_progress for more than this time without updates */
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** Feature error is escalation-worthy after this many failures */
const FAILURE_ESCALATION_THRESHOLD = 2;

interface BlockerDetection {
  featureId: string;
  featureTitle: string;
  type: 'stale' | 'failed' | 'deadlock';
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

/** Custom state for Status Monitor agent */
interface StatusCustomState {
  pollTimers: Map<string, ReturnType<typeof setInterval>>;
  /** Track which blockers have already been escalated to avoid duplicate notifications */
  escalatedBlockers: Set<string>;
}

export class StatusMonitorAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly featureLoader: FeatureLoader;

  /** Agent state (agents, initialization, poll timers, escalated blockers) */
  private readonly state: AgentState<StatusCustomState>;

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    featureLoader: FeatureLoader
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.featureLoader = featureLoader;
    this.state = createAgentState<StatusCustomState>({
      pollTimers: new Map(),
      escalatedBlockers: new Set(),
    });
  }

  async initialize(projectPath: string): Promise<void> {
    await initializeAgent(
      this.state,
      this.authorityService,
      'principal-engineer',
      projectPath,
      async () => {
        // Start periodic scanning
        const timer = setInterval(() => {
          void this.scanForBlockers(projectPath);
        }, SCAN_INTERVAL_MS);
        this.state.custom.pollTimers.set(projectPath, timer);

        // Initial scan
        await this.scanForBlockers(projectPath);
      }
    );
  }

  stop(projectPath: string): void {
    const timer = this.state.custom.pollTimers.get(projectPath);
    if (timer) {
      clearInterval(timer);
      this.state.custom.pollTimers.delete(projectPath);
    }
    this.state.removeInitialized(projectPath);
  }

  /**
   * Scan all features for potential blockers.
   */
  private async scanForBlockers(projectPath: string): Promise<void> {
    try {
      const features = await this.featureLoader.getAll(projectPath);
      const blockers: BlockerDetection[] = [];

      // Check for stale features
      for (const feature of features) {
        if (
          (feature.workItemState === 'in_progress' || feature.status === 'running') &&
          feature.startedAt
        ) {
          const startedAt = new Date(feature.startedAt).getTime();
          const elapsed = Date.now() - startedAt;

          if (elapsed > STALE_THRESHOLD_MS) {
            blockers.push({
              featureId: feature.id,
              featureTitle: feature.title || 'Untitled',
              type: 'stale',
              reason: `In progress for ${Math.round(elapsed / 60000)} minutes without completion`,
              severity: elapsed > STALE_THRESHOLD_MS * 2 ? 'high' : 'medium',
            });
          }
        }
      }

      // Check for failed features with high failure count
      for (const feature of features) {
        if (
          feature.status === 'failed' &&
          (feature.failureCount || 0) >= FAILURE_ESCALATION_THRESHOLD
        ) {
          blockers.push({
            featureId: feature.id,
            featureTitle: feature.title || 'Untitled',
            type: 'failed',
            reason: `Failed ${feature.failureCount} times. Error: ${feature.error || 'unknown'}`,
            severity: 'high',
          });
        }
      }

      // Check for dependency deadlocks
      const deadlocks = this.detectDeadlocks(features);
      blockers.push(...deadlocks);

      // Process new blockers
      const newBlockers = blockers.filter(
        (b) => !this.state.custom.escalatedBlockers.has(b.featureId)
      );
      if (newBlockers.length > 0) {
        await this.escalateBlockers(projectPath, newBlockers);
      }
    } catch (error) {
      logger.error('Failed to scan for blockers:', error);
    }
  }

  /**
   * Detect circular dependency deadlocks.
   */
  private detectDeadlocks(features: Feature[]): BlockerDetection[] {
    const deadlocks: BlockerDetection[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const featureMap = new Map<string, Feature>();
    for (const f of features) {
      featureMap.set(f.id, f);
    }

    const hasCycle = (featureId: string, path: string[]): boolean => {
      if (inStack.has(featureId)) return true;
      if (visited.has(featureId)) return false;

      visited.add(featureId);
      inStack.add(featureId);

      const feature = featureMap.get(featureId);
      if (feature?.dependencies) {
        for (const depId of feature.dependencies) {
          const dep = featureMap.get(depId);
          if (dep && dep.status !== 'done') {
            if (hasCycle(depId, [...path, featureId])) {
              return true;
            }
          }
        }
      }

      inStack.delete(featureId);
      return false;
    };

    for (const feature of features) {
      if (feature.dependencies?.length && feature.status !== 'done' && !visited.has(feature.id)) {
        if (hasCycle(feature.id, [])) {
          deadlocks.push({
            featureId: feature.id,
            featureTitle: feature.title || 'Untitled',
            type: 'deadlock',
            reason: 'Circular dependency detected',
            severity: 'high',
          });
        }
      }
    }

    return deadlocks;
  }

  /**
   * Escalate detected blockers through the authority system.
   */
  private async escalateBlockers(projectPath: string, blockers: BlockerDetection[]): Promise<void> {
    const agent = this.state.getAgent(projectPath);
    if (!agent) return;

    for (const blocker of blockers) {
      // Submit escalation proposal
      const decision = await this.authorityService.submitProposal(
        {
          who: agent.id,
          what: 'escalate',
          target: blocker.featureId,
          justification: `[${blocker.type.toUpperCase()}] ${blocker.reason}`,
          risk: blocker.severity === 'high' ? 'high' : 'medium',
        },
        projectPath
      );

      this.state.custom.escalatedBlockers.add(blocker.featureId);

      // Emit blocker detection event (for Discord routing)
      this.events.emit('authority:awaiting-approval', {
        projectPath,
        proposal: {
          who: agent.id,
          what: 'escalate',
          target: blocker.featureId,
          justification: `[${blocker.type.toUpperCase()}] ${blocker.reason}`,
          risk: blocker.severity,
        },
        decision,
        blockerType: blocker.type,
        featureTitle: blocker.featureTitle,
      });

      logger.info(
        `Blocker escalated: "${blocker.featureTitle}" (${blocker.type}) → ${decision.verdict}`
      );
    }
  }

  getAgent(projectPath: string): AuthorityAgent | null {
    return this.state.getAgent(projectPath);
  }
}
