/**
 * Lead Engineer — Ceremony Orchestrator
 *
 * Handles project completion ceremonies: aggregates final metrics,
 * emits completion events, and tears down the session.
 * CeremonyService handles retro + Discord automatically (already subscribed to project:completed).
 */

import { createLogger } from '@protolabs-ai/utils';
import type { LeadEngineerSession } from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { WorldStateBuilder } from './lead-engineer-world-state.js';

const logger = createLogger('LeadEngineerService');

export interface CeremonyOrchestratorDeps {
  events: EventEmitter;
  featureLoader: FeatureLoader;
  worldStateBuilder: WorldStateBuilder;
}

export class CeremonyOrchestrator {
  constructor(private deps: CeremonyOrchestratorDeps) {}

  /**
   * Handle project completion: transition to completing state.
   * Aggregates final metrics and emits completion event.
   * Returns true if session should be torn down.
   */
  async handleProjectCompleting(
    session: LeadEngineerSession,
    stopSession: (projectPath: string) => void,
    removeSession: (projectPath: string) => Promise<void>
  ): Promise<void> {
    session.flowState = 'completing';
    this.deps.events.emit('lead-engineer:project-completing', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Project ${session.projectSlug} completing — aggregating final metrics`);

    // Refresh final world state
    try {
      session.worldState = await this.deps.worldStateBuilder.build(
        session.projectPath,
        session.projectSlug,
        session.worldState.maxConcurrency
      );
    } catch (err) {
      logger.error(`Failed to build final world state:`, err);
    }

    // Emit completion event
    this.deps.events.emit('lead-engineer:project-completed', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    // Transition to idle and clean up
    session.flowState = 'idle';
    stopSession(session.projectPath);

    await removeSession(session.projectPath);

    this.deps.events.emit('lead-engineer:stopped', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Project ${session.projectSlug} completed. Lead Engineer session ended.`);
  }
}
