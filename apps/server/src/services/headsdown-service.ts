/**
 * HeadsdownService - Autonomous agent lifecycle management
 *
 * Manages headsdown agents that continuously monitor for work and execute tasks.
 * Similar to AutoModeService but focused on persistent autonomous agents.
 */

import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type {
  AgentInstance,
  AgentRole,
  HeadsdownConfig,
  HeadsdownState,
  WorkItem,
  IdleTaskType,
} from '@automaker/types';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@automaker/utils';

/** Simplified goal type for work evaluation (GOAP removed) */
interface WorkGoal {
  id: string;
  name: string;
  conditions: Array<{ key: string; value: boolean | number | string }>;
  priority: number;
}

/** Simplified world state for work evaluation */
type WorldState = Record<string, boolean | number | string>;
import { DiscordMonitor } from './discord-monitor.js';
import { LinearMonitor } from './linear-monitor.js';
import { GitHubMonitor } from './github-monitor.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const logger = createLogger('HeadsdownService');

/**
 * HeadsdownService - Manages autonomous headsdown agents
 *
 * Singleton service that coordinates headsdown agent lifecycle:
 * - Starting and stopping agents
 * - Work detection and execution loops
 * - State persistence and recovery
 * - Event emission for monitoring
 */
export class HeadsdownService {
  private static instance: HeadsdownService;

  /** Active agent instances */
  private agents = new Map<string, AgentInstance>();

  /** Active work loops (for stopping) */
  private workLoops = new Map<string, boolean>();

  /** Loop intervals for cleanup */
  private loopIntervals = new Map<string, NodeJS.Timeout>();

  /** Discord monitor for detecting user messages */
  private discordMonitor: DiscordMonitor;

  /** Linear monitor for detecting projects and issues */
  private linearMonitor: LinearMonitor;

  /** GitHub monitor for detecting PRs needing review */
  private githubMonitor: GitHubMonitor;

  constructor(
    private events: EventEmitter,
    private settingsService: SettingsService,
    private featureLoader: FeatureLoader
  ) {
    this.discordMonitor = new DiscordMonitor(events);
    this.linearMonitor = new LinearMonitor(events);
    this.githubMonitor = new GitHubMonitor(events);

    // Subscribe to monitor events
    this.events.subscribe((type, payload: any) => {
      switch (type) {
        case 'discord:message:detected':
          logger.info(`Discord message detected in channel ${payload.channelId}`);
          // Add message to work queue for appropriate agents
          // This will be picked up by agents monitoring that channel
          break;

        case 'linear:project:updated':
          logger.info(`Linear project updated: ${payload.project.name}`);
          // Add project to work queue for EM agents
          break;

        case 'linear:issue:detected':
          logger.info(`Linear issue detected: ${payload.issue.identifier}`);
          // Add issue to work queue for engineer agents
          break;

        case 'github:pr:detected':
          logger.info(`GitHub PR detected: #${payload.pr.number}`);
          // Add PR to work queue for QA agents
          break;
      }
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(
    events: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader
  ): HeadsdownService {
    if (!HeadsdownService.instance) {
      HeadsdownService.instance = new HeadsdownService(events, settingsService, featureLoader);
    }
    return HeadsdownService.instance;
  }

  /**
   * Start a headsdown agent
   */
  async startAgent(config: HeadsdownConfig): Promise<string> {
    const agentId = config.agentId || uuidv4();

    // Check if agent already running
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already running`);
    }

    // Register agent
    const agent = this.registerAgent({ ...config, agentId });

    // Start Discord monitoring if configured
    if (config.monitors.discord) {
      await this.discordMonitor.startMonitoring(config.monitors.discord);
      logger.info(`Started Discord monitoring for agent ${agentId}`);
    }

    // Start Linear monitoring if configured
    if (config.monitors.linear) {
      await this.linearMonitor.startMonitoring(config.monitors.linear);
      logger.info(`Started Linear monitoring for agent ${agentId}`);
    }

    // Start GitHub monitoring if configured
    if (config.monitors.github) {
      await this.githubMonitor.startMonitoring(config.monitors.github);
      logger.info(`Started GitHub monitoring for agent ${agentId}`);
    }

    // Emit start event
    this.events.emit('headsdown:agent:started', {
      agentId,
      role: agent.role,
      projectPath: agent.projectPath,
    });

    logger.info(`Started headsdown agent: ${agentId} (${agent.role})`);

    // Start work loop if enabled
    if (config.loop.enabled) {
      this.startWorkLoop(agentId);
    }

    return agentId;
  }

  /**
   * Stop a headsdown agent
   */
  async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Stop Discord monitoring if configured
    if (agent.monitoring.discord) {
      for (const channelId of agent.monitoring.discord.channelIds) {
        this.discordMonitor.stopMonitoring(channelId);
      }
      logger.info(`Stopped Discord monitoring for agent ${agentId}`);
    }

    // Stop Linear monitoring if configured
    if (agent.monitoring.linear) {
      this.linearMonitor.stopAll();
      logger.info(`Stopped Linear monitoring for agent ${agentId}`);
    }

    // Stop GitHub monitoring if configured
    if (agent.monitoring.github) {
      this.githubMonitor.stopAll();
      logger.info(`Stopped GitHub monitoring for agent ${agentId}`);
    }

    // Stop work loop
    this.workLoops.set(agentId, false);

    // Clear interval
    const interval = this.loopIntervals.get(agentId);
    if (interval) {
      clearTimeout(interval);
      this.loopIntervals.delete(agentId);
    }

    // Update agent status
    agent.status = 'stopped';

    // Save final state
    await this.saveAgentState(agentId);

    // Remove from active agents
    this.agents.delete(agentId);

    // Emit stop event
    this.events.emit('headsdown:agent:stopped', {
      agentId,
      role: agent.role,
      stats: agent.stats,
    });

    logger.info(`Stopped headsdown agent: ${agentId} (${agent.role})`);
  }

  /**
   * Pause a headsdown agent
   */
  async pauseAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = 'paused';
    this.workLoops.set(agentId, false);

    await this.saveAgentState(agentId);

    logger.info(`Paused headsdown agent: ${agentId}`);
  }

  /**
   * Resume a headsdown agent
   */
  async resumeAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = 'idle';
    this.startWorkLoop(agentId);

    await this.saveAgentState(agentId);

    logger.info(`Resumed headsdown agent: ${agentId}`);
  }

  /**
   * List all active agents
   */
  listAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Register agent instance
   */
  private registerAgent(config: HeadsdownConfig): AgentInstance {
    const agent: AgentInstance = {
      id: config.agentId,
      role: config.role,
      status: 'idle',
      monitoring: config.monitors,
      model: config.model,
      maxTurns: config.maxTurns,
      projectPath: config.projectPath,
      stats: {
        featuresCompleted: 0,
        prsReviewed: 0,
        idleTasksCompleted: 0,
        totalTurns: 0,
      },
      startedAt: new Date().toISOString(),
    };

    this.agents.set(agent.id, agent);

    return agent;
  }

  /**
   * Start work loop for an agent
   */
  private startWorkLoop(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.error(`Cannot start work loop: agent ${agentId} not found`);
      return;
    }

    // Enable loop
    this.workLoops.set(agentId, true);

    // Start loop
    this.runWorkLoop(agentId);
  }

  /**
   * Run work loop (recursive with setTimeout)
   */
  private async runWorkLoop(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent || !this.workLoops.get(agentId)) {
      return;
    }

    try {
      // Update last check time
      agent.lastCheckAt = new Date().toISOString();

      // Check for work
      const workItems = await this.checkForWork(agent);

      if (workItems.length > 0) {
        // Execute highest priority work
        await this.claimAndExecute(agent, workItems[0]);
      } else {
        // No primary work - do idle tasks or wait
        await this.performIdleWork(agent);
      }

      // Save state periodically
      if (agent.stats.totalTurns % 10 === 0) {
        await this.saveAgentState(agentId);
      }

      // Schedule next check
      const checkInterval = agent.monitoring.discord?.pollInterval || 30000;
      const timeout = setTimeout(() => {
        this.runWorkLoop(agentId);
      }, checkInterval);

      this.loopIntervals.set(agentId, timeout);
    } catch (error) {
      logger.error(`Work loop error for agent ${agentId}:`, error);

      // Emit error event
      this.events.emit('headsdown:agent:error', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Continue loop after error
      const timeout = setTimeout(() => {
        this.runWorkLoop(agentId);
      }, 30000);

      this.loopIntervals.set(agentId, timeout);
    }
  }

  /**
   * Check for available work using goal evaluation
   *
   * Evaluates current world state and determines what work is available
   * based on agent role and monitoring configuration.
   */
  private async checkForWork(agent: AgentInstance): Promise<WorkItem[]> {
    const workItems: WorkItem[] = [];

    // Build current world state
    const worldState = await this.buildWorldState(agent);

    // Get relevant goals for agent role
    const goals = this.getGoalsForRole(agent.role);

    // Evaluate goals and generate work items
    for (const goal of goals) {
      const workItem = await this.evaluateGoal(agent, goal, worldState);
      if (workItem) {
        workItems.push(workItem);
      }
    }

    // Sort by priority (lower value = higher priority)
    workItems.sort((a, b) => a.priority - b.priority);

    // Check for blocking conditions (max turns, consecutive errors, etc.)
    if (agent.stats.totalTurns >= agent.maxTurns) {
      logger.warn(`Agent ${agent.id} reached max turns (${agent.maxTurns})`);
      return []; // Stop agent
    }

    return workItems;
  }

  /**
   * Build world state for work evaluation
   */
  private async buildWorldState(agent: AgentInstance): Promise<WorldState> {
    const state: WorldState = {
      // Agent state
      agent_role: agent.role,
      agent_idle: agent.status === 'idle',
      total_turns: agent.stats.totalTurns,

      // Monitoring state
      discord_monitoring_active: !!agent.monitoring.discord,
      linear_monitoring_active: !!agent.monitoring.linear,
      github_monitoring_active: !!agent.monitoring.github,

      // Work availability (will be populated by monitors)
      message_detected: false,
      feature_available: false,
      pr_available: false,

      // Completion state
      user_requirements_gathered: false,
      scope_confirmed: false,
      research_completed: false,
      prd_drafted: false,
      user_approved_prd: false,
    };

    // TODO: Query actual monitoring sources to populate state
    // For now, return base state

    return state;
  }

  /**
   * Get relevant goals for agent role
   */
  private getGoalsForRole(role: AgentRole): WorkGoal[] {
    const goals: WorkGoal[] = [];

    switch (role) {
      case 'product-manager':
        goals.push(
          {
            id: 'user_request_understood',
            name: 'User Request Understood',
            conditions: [{ key: 'user_requirements_gathered', value: true }],
            priority: 10,
          },
          {
            id: 'prd_approved',
            name: 'PRD Approved',
            conditions: [{ key: 'prd_drafted', value: true }],
            priority: 9,
          }
        );
        break;
      case 'engineering-manager':
        goals.push({
          id: 'features_assigned',
          name: 'Features Assigned',
          conditions: [{ key: 'roles_assigned', value: true }],
          priority: 8,
        });
        break;
      case 'frontend-engineer':
      case 'backend-engineer':
      case 'devops-engineer':
        goals.push({
          id: 'feature_implemented',
          name: 'Feature Implemented',
          conditions: [{ key: 'code_written', value: true }],
          priority: 7,
        });
        break;
      case 'qa-engineer':
        goals.push({
          id: 'pr_quality_verified',
          name: 'PR Quality Verified',
          conditions: [{ key: 'review_posted', value: true }],
          priority: 6,
        });
        break;
      case 'docs-engineer':
        goals.push({
          id: 'docs_current',
          name: 'Documentation Current',
          conditions: [{ key: 'docs_updated', value: true }],
          priority: 5,
        });
        break;
    }

    // All agents can work on productivity when idle
    goals.push({
      id: 'maximize_productivity',
      name: 'Maximize Productivity',
      conditions: [{ key: 'blocking_prs_reviewed', value: true }],
      priority: 3,
    });

    return goals;
  }

  /**
   * Evaluate if a goal can be pursued given current world state
   */
  private async evaluateGoal(
    agent: AgentInstance,
    goal: WorkGoal,
    worldState: WorldState
  ): Promise<WorkItem | null> {
    // Check if goal conditions are already satisfied
    const satisfied = goal.conditions.every((condition) => {
      const value = worldState[condition.key];
      return value === condition.value;
    });

    if (satisfied) {
      return null; // Goal already achieved
    }

    // Check if we have work available to progress toward this goal
    // This is simplified — checks immediate work opportunities
    // For now, we check for immediate work opportunities

    if (goal.id === 'user_request_understood' && worldState.discord_monitoring_active) {
      // Check for Discord messages (would query Discord monitor)
      return null; // No messages detected yet
    }

    if (goal.id === 'feature_implemented' && worldState.linear_monitoring_active) {
      // Check for assigned Linear issues (would query Linear monitor)
      return null; // No issues assigned yet
    }

    if (goal.id === 'pr_quality_verified' && worldState.github_monitoring_active) {
      // Check for PRs needing review (would query GitHub monitor)
      return null; // No PRs to review yet
    }

    return null;
  }

  /**
   * Claim and execute work item
   */
  private async claimAndExecute(agent: AgentInstance, workItem: WorkItem): Promise<void> {
    agent.status = 'working';
    agent.currentTask = {
      type: workItem.type as any, // Will be properly typed when work detection is implemented
      id: workItem.id,
      startedAt: new Date().toISOString(),
      description: workItem.description,
    };

    this.events.emit('headsdown:agent:working', {
      agentId: agent.id,
      task: agent.currentTask,
    });

    try {
      // TODO: Implement work execution
      logger.info(`Agent ${agent.id} executing work: ${workItem.description}`);

      // Update stats
      agent.stats.totalTurns++;
    } catch (error) {
      logger.error(`Work execution failed for agent ${agent.id}:`, error);
      throw error;
    } finally {
      agent.status = 'idle';
      agent.currentTask = undefined;
    }
  }

  /**
   * Perform idle work
   */
  private async performIdleWork(agent: AgentInstance): Promise<void> {
    // TODO: Implement idle task execution
    this.events.emit('headsdown:agent:idle', {
      agentId: agent.id,
      reason: 'no_work_available',
    });
  }

  /**
   * Save agent state to disk atomically
   */
  private async saveAgentState(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    const statePath = this.getAgentStatePath(agentId);
    const stateDir = path.dirname(statePath);

    // Ensure directory exists
    if (!existsSync(stateDir)) {
      await mkdir(stateDir, { recursive: true });
    }

    const state: HeadsdownState = {
      agentId: agent.id,
      status: agent.status,
      currentTurns: agent.stats.totalTurns,
      consecutiveErrors: 0, // TODO: Track errors properly
      updatedAt: new Date().toISOString(),
    };

    try {
      await atomicWriteJson(statePath, state);
      logger.debug(`Saved state for agent ${agentId}`);
    } catch (error) {
      logger.error(`Failed to save state for agent ${agentId}:`, error);
    }
  }

  /**
   * Load agent state from disk with backup recovery
   */
  private async loadAgentState(agentId: string): Promise<HeadsdownState | null> {
    const statePath = this.getAgentStatePath(agentId);

    if (!existsSync(statePath)) {
      return null;
    }

    try {
      const result = await readJsonWithRecovery<HeadsdownState>(statePath, null, {
        maxBackups: 3,
        autoRestore: true,
      });

      if (result.data) {
        logger.debug(`Loaded state for agent ${agentId}`);
        return result.data;
      }

      if (result.recovered) {
        logger.warn(`Recovered state for agent ${agentId} from backup`);
      }
    } catch (error) {
      logger.error(`Failed to load state for agent ${agentId}:`, error);
    }

    return null;
  }

  /**
   * Get agent state file path
   */
  private getAgentStatePath(agentId: string): string {
    // TODO: Use proper data directory from settings
    return path.join(process.cwd(), '.automaker', 'headsdown', agentId, 'state.json');
  }
}
