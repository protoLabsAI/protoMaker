/**
 * Signal Router Service
 *
 * Routes incoming signals to appropriate actions based on signal type.
 * Implements simplified routing rules without AI classification:
 * - Ideas → auto-create SPARC PRD draft → enter antagonistic review
 * - Bugs → fast-track: create Automaker feature directly
 * - Improvements → create Bead
 * - Questions → post to Discord for human response
 *
 * Event flow: signal:received → signal:routed → appropriate action
 */

import type { EventEmitter } from '../lib/events.js';
import { createLogger } from '@automaker/utils';
import type { BeadsService } from './beads-service.js';
import type { PRDService } from './prd-service.js';
import type { DiscordService } from './discord-service.js';

const logger = createLogger('SignalRouterService');

/**
 * Signal types for routing
 */
export type SignalType = 'idea' | 'bug' | 'improvement' | 'question';

/**
 * Incoming signal structure
 */
export interface Signal {
  id: string;
  type: SignalType;
  title: string;
  description: string;
  source: string; // Discord, Linear, GitHub, etc.
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Signal routing result
 */
export interface SignalRoutingResult {
  signalId: string;
  signalType: SignalType;
  action: 'prd_draft' | 'feature_created' | 'bead_created' | 'discord_posted';
  actionId?: string;
  timestamp: string;
}

/**
 * SignalRouterService routes signals to appropriate actions
 */
export class SignalRouterService {
  private events: EventEmitter;
  private beadsService: BeadsService;
  private prdService: PRDService;
  private discordService: DiscordService;
  private projectPath: string;
  private enabled: boolean = false;

  constructor(
    events: EventEmitter,
    beadsService: BeadsService,
    prdService: PRDService,
    discordService: DiscordService,
    projectPath: string
  ) {
    this.events = events;
    this.beadsService = beadsService;
    this.prdService = prdService;
    this.discordService = discordService;
    this.projectPath = projectPath;
  }

  /**
   * Start listening for signal:received events
   */
  start(): void {
    if (this.enabled) {
      logger.warn('SignalRouterService already started');
      return;
    }

    this.events.subscribe((type, payload) => {
      if (type === 'signal:received') {
        void this.routeSignal(payload as Signal);
      }
    });

    this.enabled = true;
    logger.info('SignalRouterService started - listening for signal:received events');
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    this.enabled = false;
    logger.info('SignalRouterService stopped');
  }

  /**
   * Route a signal to the appropriate action
   */
  async routeSignal(signal: Signal): Promise<SignalRoutingResult> {
    logger.info(`Routing signal: ${signal.id} (type: ${signal.type})`);

    try {
      let result: SignalRoutingResult;

      switch (signal.type) {
        case 'idea':
          result = await this.handleIdeaSignal(signal);
          break;
        case 'bug':
          result = await this.handleBugSignal(signal);
          break;
        case 'improvement':
          result = await this.handleImprovementSignal(signal);
          break;
        case 'question':
          result = await this.handleQuestionSignal(signal);
          break;
        default:
          throw new Error(`Unknown signal type: ${signal.type}`);
      }

      // Emit signal:routed event
      this.events.emit('signal:routed', result);

      logger.info(
        `Signal routed: ${signal.id} → ${result.action}${result.actionId ? ` (${result.actionId})` : ''}`
      );

      return result;
    } catch (error) {
      logger.error(`Failed to route signal ${signal.id}:`, error);
      throw error;
    }
  }

  /**
   * Handle idea signal: Create SPARC PRD draft → antagonistic review
   */
  private async handleIdeaSignal(signal: Signal): Promise<SignalRoutingResult> {
    logger.info(`Creating PRD draft for idea: ${signal.title}`);

    // Create SPARC PRD structure
    const sparcPrd = {
      situation: `Signal from ${signal.source}: ${signal.title}\n\n${signal.description}`,
      problem: `This idea needs to be refined into a SPARC PRD with proper problem definition`,
      approach: 'To be determined during PRD review',
      results: 'To be determined during PRD review',
      constraints: 'To be determined during PRD review',
      generatedAt: new Date().toISOString(),
    };

    // Create PRD draft
    const prd = await this.prdService.createPRD({
      projectPath: process.cwd(),
      prd: sparcPrd,
      agentId: 'signal-router',
      discordThreadId: signal.metadata?.discordThreadId as string | undefined,
    });

    // Emit PRD review start event to trigger antagonistic review
    this.events.emit('prd:review:started', {
      prdId: prd.metadata.id,
      status: 'draft',
      timestamp: new Date().toISOString(),
    });

    return {
      signalId: signal.id,
      signalType: 'idea',
      action: 'prd_draft',
      actionId: prd.metadata.id,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle bug signal: Fast-track to feature creation
   */
  private async handleBugSignal(signal: Signal): Promise<SignalRoutingResult> {
    logger.info(`Creating feature for bug: ${signal.title}`);

    // Emit feature creation event (feature creation service will handle)
    const featureId = `bug-${signal.id}`;
    this.events.emit('feature:created', {
      featureId,
      title: `[Bug] ${signal.title}`,
      description: signal.description,
      type: 'bug',
      source: signal.source,
      metadata: signal.metadata,
      timestamp: new Date().toISOString(),
    });

    return {
      signalId: signal.id,
      signalType: 'bug',
      action: 'feature_created',
      actionId: featureId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle improvement signal: Create Bead
   */
  private async handleImprovementSignal(signal: Signal): Promise<SignalRoutingResult> {
    logger.info(`Creating Bead for improvement: ${signal.title}`);

    // Create Bead task
    const beadResult = await this.beadsService.createTask(this.projectPath, {
      title: signal.title,
      description: `${signal.description}\n\nSource: ${signal.source} | Signal ID: ${signal.id}`,
      labels: ['improvement', signal.source],
    });

    if (!beadResult.success) {
      throw new Error(`Failed to create Bead: ${beadResult.error}`);
    }

    // Emit Bead created event
    this.events.emit('beads:task-created', {
      taskId: beadResult.data?.id,
      title: signal.title,
      source: 'signal-router',
      timestamp: new Date().toISOString(),
    });

    return {
      signalId: signal.id,
      signalType: 'improvement',
      action: 'bead_created',
      actionId: beadResult.data?.id,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle question signal: Post to Discord for human response
   */
  private async handleQuestionSignal(signal: Signal): Promise<SignalRoutingResult> {
    logger.info(`Posting question to Discord: ${signal.title}`);

    // Post to Discord (assuming a questions channel exists)
    const discordResult = await this.discordService.sendMessage({
      channelId: process.env.DISCORD_QUESTIONS_CHANNEL_ID || '',
      message: `**Question from ${signal.source}**\n\n**${signal.title}**\n\n${signal.description}`,
    });

    if (!discordResult.success) {
      logger.warn(`Failed to post question to Discord: ${discordResult.error}`);
      // Continue anyway - question was acknowledged
    }

    return {
      signalId: signal.id,
      signalType: 'question',
      action: 'discord_posted',
      actionId: discordResult.data?.id,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get service status
   */
  getStatus(): { enabled: boolean } {
    return { enabled: this.enabled };
  }
}
