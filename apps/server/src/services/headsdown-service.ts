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
  AgentTaskType,
  HeadsdownConfig,
  HeadsdownState,
  WorkItem,
  DesiredStateCondition,
  StateOperator,
} from '@protolabsai/types';
import { DEFAULT_HEADSDOWN_CONFIGS } from '@protolabsai/types';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabsai/utils';
import type { RoleRegistryService } from './role-registry-service.js';

/** Goal type for work evaluation */
interface WorkGoal {
  id: string;
  name: string;
  conditions: Array<{ key: string; value: boolean | number | string }>;
  priority: number;
}

/** World state — a flat map of observable metrics populated by monitors */
type WorldState = Record<string, boolean | number | string>;

/** A divergence between desired and actual world state */
export interface StateDivergence {
  /** The desired state condition that diverged */
  condition: DesiredStateCondition;
  /** The actual value observed */
  actualValue: boolean | number | string | undefined;
  /** Human-readable summary for the agent */
  summary: string;
}
import { DiscordMonitor, type DiscordBotServiceLike } from './discord-monitor.js';
import { GitHubMonitor } from './github-monitor.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import v8 from 'node:v8';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { AgentFactoryService } from './agent-factory-service.js';
import type { DynamicAgentExecutor } from './dynamic-agent-executor.js';

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

  /** Consecutive error counts per agent */
  private consecutiveErrors = new Map<string, number>();

  /** Last work timestamp per agent (milliseconds) */
  private lastWorkTimestamp = new Map<string, number>();

  /** Discord monitor for detecting user messages */
  private discordMonitor: DiscordMonitor;

  /** GitHub monitor for detecting PRs needing review */
  private githubMonitor: GitHubMonitor;

  /** Optional role registry for dynamic role resolution + desired state */
  private roleRegistry?: RoleRegistryService;

  /** Agent factory for creating agent configurations */
  private agentFactory?: AgentFactoryService;

  /** Dynamic agent executor for running agents */
  private executor?: DynamicAgentExecutor;

  constructor(
    private events: EventEmitter,
    private settingsService: SettingsService,
    private featureLoader: FeatureLoader,
    roleRegistry?: RoleRegistryService
  ) {
    this.roleRegistry = roleRegistry;
    this.discordMonitor = new DiscordMonitor(events);
    this.githubMonitor = new GitHubMonitor(events);

    // Subscribe to monitor events
    this.events.subscribe((type, payload: unknown) => {
      const data = payload as Record<string, unknown>;
      switch (type) {
        case 'discord:message:detected':
          logger.info(`Discord message detected in channel ${data.channelId}`);
          // Add message to work queue for appropriate agents
          // This will be picked up by agents monitoring that channel
          break;

        case 'github:pr:detected': {
          const pr = data.pr as Record<string, unknown> | undefined;
          logger.info(`GitHub PR detected: #${pr?.number}`);
          // Add PR to work queue for QA agents
          break;
        }
      }
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(
    events: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    roleRegistry?: RoleRegistryService
  ): HeadsdownService {
    if (!HeadsdownService.instance) {
      HeadsdownService.instance = new HeadsdownService(
        events,
        settingsService,
        featureLoader,
        roleRegistry
      );
    }
    return HeadsdownService.instance;
  }

  /**
   * Set the Discord bot service for message fetching
   */
  setDiscordBotService(service: DiscordBotServiceLike): void {
    this.discordMonitor.setDiscordBotService(service);
  }

  /**
   * Set agent execution dependencies (factory + executor).
   * Must be called before agents can execute work.
   */
  setAgentExecution(factory: AgentFactoryService, executor: DynamicAgentExecutor): void {
    this.agentFactory = factory;
    this.executor = executor;
    logger.info('Agent execution capabilities initialized');
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

    // Start GitHub monitoring if configured
    if (config.monitors.github && config.projectPath) {
      this.githubMonitor.setProjectPath(config.projectPath);
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
    this.consecutiveErrors.delete(agentId);
    this.lastWorkTimestamp.delete(agentId);

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
    this.consecutiveErrors.set(agent.id, 0);
    this.lastWorkTimestamp.set(agent.id, Date.now());

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

      // Increment consecutive error count
      const errorCount = (this.consecutiveErrors.get(agentId) ?? 0) + 1;
      this.consecutiveErrors.set(agentId, errorCount);

      // Emit error event
      this.events.emit('headsdown:agent:error', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
        consecutiveErrors: errorCount,
      });

      // Continue loop after error
      const timeout = setTimeout(() => {
        this.runWorkLoop(agentId);
      }, 30000);

      this.loopIntervals.set(agentId, timeout);
    }
  }

  /**
   * Check for available work using desired state evaluation + goal evaluation.
   *
   * Priority order:
   * 1. Desired state divergences (reactive — restore equilibrium)
   * 2. Role-specific goals (proactive — achieve objectives)
   * 3. Idle tasks (opportunistic — productive waiting)
   */
  private async checkForWork(agent: AgentInstance): Promise<WorkItem[]> {
    const workItems: WorkItem[] = [];

    // Build current world state
    const worldState = await this.buildWorldState(agent);

    // 1. Check desired state conditions from registry template
    const divergences = this.evaluateDesiredState(agent.role, worldState);
    for (const div of divergences) {
      workItems.push({
        id: `divergence:${div.condition.key}`,
        type: 'state_divergence',
        description: div.summary,
        priority: div.condition.priority ?? 5,
        source: 'desired_state',
        metadata: {
          key: div.condition.key,
          operator: div.condition.operator,
          expected: String(div.condition.value),
          actual: String(div.actualValue ?? 'undefined'),
        },
      } as WorkItem);
    }

    // 2. Evaluate role-specific goals
    const goals = this.getGoalsForRole(agent.role);
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
   * Evaluate desired state conditions against current world state.
   * Returns divergences — conditions where reality doesn't match the desired state.
   */
  evaluateDesiredState(role: AgentRole, worldState: WorldState): StateDivergence[] {
    if (!this.roleRegistry) return [];

    const template = this.roleRegistry.get(role);
    if (!template?.desiredState || template.desiredState.length === 0) return [];

    const divergences: StateDivergence[] = [];

    for (const condition of template.desiredState) {
      // Skip conditions that require a monitor that isn't active
      if (condition.requiresMonitor) {
        const monitorActive = worldState[`${condition.requiresMonitor}_monitoring_active`];
        if (!monitorActive) continue;
      }

      const actual = worldState[condition.key];

      // If the key doesn't exist in world state, we can't evaluate
      if (actual === undefined) {
        logger.debug(`World state key "${condition.key}" not available, skipping condition`);
        continue;
      }

      const satisfied = this.evaluateCondition(actual, condition.operator, condition.value);

      if (!satisfied) {
        const desc =
          condition.description ?? `${condition.key} ${condition.operator} ${condition.value}`;
        divergences.push({
          condition,
          actualValue: actual,
          summary: `State divergence: ${desc} (expected ${condition.operator} ${condition.value}, got ${actual})`,
        });

        logger.info(
          `Desired state diverged for ${role}: ${condition.key}=${actual} (want ${condition.operator} ${condition.value})`
        );
      }
    }

    return divergences;
  }

  /**
   * Evaluate a single condition: does `actual` satisfy `operator value`?
   */
  private evaluateCondition(
    actual: boolean | number | string,
    operator: StateOperator,
    expected: boolean | number | string
  ): boolean {
    switch (operator) {
      case '==':
        return actual === expected;
      case '!=':
        return actual !== expected;
      case '<':
        return actual < expected;
      case '<=':
        return actual <= expected;
      case '>':
        return actual > expected;
      case '>=':
        return actual >= expected;
      default:
        return false;
    }
  }

  /**
   * Build world state for work evaluation
   */
  private async buildWorldState(agent: AgentInstance): Promise<WorldState> {
    const lastWorkTime = this.lastWorkTimestamp.get(agent.id) ?? Date.now();
    const idleDurationMs = Date.now() - lastWorkTime;
    const consecutiveErrorCount = this.consecutiveErrors.get(agent.id) ?? 0;

    const state: WorldState = {
      // Agent state
      agent_role: agent.role,
      agent_idle: agent.status === 'idle',
      total_turns: agent.stats.totalTurns,
      consecutive_errors: consecutiveErrorCount,
      idle_duration_ms: idleDurationMs,

      // Monitoring state
      discord_monitoring_active: !!agent.monitoring.discord,
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

    // Populate board-level metrics from feature loader
    if (agent.projectPath) {
      try {
        const features = await this.featureLoader.getAll(agent.projectPath);
        let backlog = 0;
        let inProgress = 0;
        let blocked = 0;
        let review = 0;

        for (const feature of features) {
          switch (feature.status) {
            case 'backlog':
              backlog++;
              break;
            case 'in_progress':
              inProgress++;
              break;
            case 'blocked':
              blocked++;
              break;
            case 'review':
              review++;
              break;
          }
        }

        state.backlog_count = backlog;
        state.in_progress_count = inProgress;
        state.blocked_count = blocked;
        state.review_count = review;
        state.feature_available = backlog > 0;
      } catch (error) {
        logger.debug(`Failed to load features for world state: ${error}`);
      }
    }

    // Populate infrastructure metrics — use v8 heap limit for accurate percentage
    const memUsage = process.memoryUsage();
    const heapLimit = v8.getHeapStatistics().heap_size_limit;
    const heapPercent = Math.round((memUsage.heapUsed / heapLimit) * 100);
    state.heap_usage_percent = heapPercent;
    state.running_agents = this.agents.size;

    return state;
  }

  /**
   * Get relevant goals for agent role.
   * Checks registry for template-defined idle tasks first, falls back to hardcoded goals.
   */
  private getGoalsForRole(role: AgentRole): WorkGoal[] {
    const goals: WorkGoal[] = [];

    // Try registry first — if a template exists with headsdown config, derive goals from it
    if (this.roleRegistry) {
      const template = this.roleRegistry.get(role);
      if (template?.headsdownConfig) {
        logger.debug(`Using registry headsdown config for role "${role}"`);
        const hdc = template.headsdownConfig;

        // Generate a primary work goal based on role description
        goals.push({
          id: `${role}_primary_work`,
          name: `${template.displayName} Primary Work`,
          conditions: [{ key: 'primary_work_completed', value: true }],
          priority: 7,
        });

        // Generate idle task goals from template config
        if (hdc.idleTasks?.enabled && hdc.idleTasks.tasks.length > 0) {
          for (const task of hdc.idleTasks.tasks) {
            goals.push({
              id: `idle_${task}`,
              name: `Idle: ${task}`,
              conditions: [{ key: `${task}_completed`, value: true }],
              priority: 3,
            });
          }
        }

        return goals;
      }
    }

    // Fall back to hardcoded goals for known roles
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
   * Get headsdown config for a role.
   * Checks registry template first, falls back to DEFAULT_HEADSDOWN_CONFIGS.
   */
  getConfigForRole(role: AgentRole): Partial<HeadsdownConfig> {
    // Try registry first
    if (this.roleRegistry) {
      const template = this.roleRegistry.get(role);
      if (template?.headsdownConfig) {
        logger.debug(`Using registry headsdown config for role "${role}"`);
        return {
          model: template.headsdownConfig.model ?? template.model ?? 'sonnet',
          maxTurns: template.headsdownConfig.maxTurns ?? template.maxTurns ?? 100,
          loop: template.headsdownConfig.loop ?? {
            enabled: true,
            checkInterval: 30000,
            maxConsecutiveErrors: 5,
            workTimeout: 7200000,
          },
          idleTasks: template.headsdownConfig.idleTasks ?? {
            enabled: false,
            tasks: [],
          },
        } as Partial<HeadsdownConfig>;
      }
    }

    // Fall back to static defaults
    return DEFAULT_HEADSDOWN_CONFIGS[role] ?? {};
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

    if (goal.id === 'pr_quality_verified' && worldState.github_monitoring_active) {
      // Check for PRs needing review (would query GitHub monitor)
      return null; // No PRs to review yet
    }

    return null;
  }

  /**
   * Build prompt for work item based on type
   */
  private buildPromptForWorkItem(workItem: WorkItem, _agent: AgentInstance): string {
    switch (workItem.type) {
      case 'discord_message':
        return `Respond to Discord message:\n\n${workItem.metadata?.content || workItem.description}`;

      case 'github_pr':
        return `Review GitHub PR #${workItem.metadata?.number || 'unknown'}:\n\nTitle: ${workItem.metadata?.title || 'Untitled'}\n\n${workItem.description}`;

      case 'state_divergence':
        return `Fix state divergence:\n\n${workItem.description}\n\nExpected: ${workItem.metadata?.expected}\nActual: ${workItem.metadata?.actual}`;

      case 'idle_task':
        return `Perform maintenance task: ${workItem.metadata?.type || workItem.description}`;

      default:
        return workItem.description;
    }
  }

  /**
   * Claim and execute work item
   */
  private async claimAndExecute(agent: AgentInstance, workItem: WorkItem): Promise<void> {
    if (!this.agentFactory || !this.executor) {
      logger.error('Agent execution not initialized — call setAgentExecution() first');
      return;
    }

    agent.status = 'working';
    agent.currentTask = {
      type: workItem.type as unknown as AgentTaskType,
      id: workItem.id,
      startedAt: new Date().toISOString(),
      description: workItem.description,
    };

    this.events.emit('headsdown:agent:working', {
      agentId: agent.id,
      task: agent.currentTask,
    });

    try {
      logger.info(`Agent ${agent.id} executing work: ${workItem.description}`);

      // Ensure agent has a project path
      if (!agent.projectPath) {
        throw new Error(`Agent ${agent.id} has no project path configured`);
      }

      // Build prompt from work item
      const prompt = this.buildPromptForWorkItem(workItem, agent);

      // Create agent config from template
      const config = this.agentFactory.createFromTemplate(agent.role, agent.projectPath);

      // Execute agent
      const result = await this.executor.execute(config, { prompt });

      if (result.success) {
        // Update stats based on work type
        agent.stats.totalTurns++;

        if (workItem.type === 'github_pr') {
          agent.stats.prsReviewed++;
        } else if (workItem.type === 'idle_task') {
          agent.stats.idleTasksCompleted++;
        }

        // Reset consecutive errors on successful work execution
        this.consecutiveErrors.set(agent.id, 0);

        // Update last work timestamp
        this.lastWorkTimestamp.set(agent.id, Date.now());

        logger.info(
          `Agent ${agent.id} completed work: ${workItem.description} (${result.durationMs}ms)`
        );

        this.events.emit('headsdown:agent:work-completed', {
          agentId: agent.id,
          workItem,
          durationMs: result.durationMs,
        });
      } else {
        logger.error(`Agent ${agent.id} work failed: ${result.error}`);
        this.events.emit('headsdown:agent:work-failed', {
          agentId: agent.id,
          workItem,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error(`Work execution failed for agent ${agent.id}:`, error);
      this.events.emit('headsdown:agent:work-failed', {
        agentId: agent.id,
        workItem,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      agent.status = 'idle';
      agent.currentTask = undefined;
    }
  }

  /**
   * Perform idle work
   */
  private async performIdleWork(agent: AgentInstance): Promise<void> {
    // Check if agent has idle tasks configured
    if (!this.roleRegistry) {
      this.events.emit('headsdown:agent:idle', {
        agentId: agent.id,
        reason: 'no_work_available',
      });
      return;
    }

    const template = this.roleRegistry.get(agent.role);
    if (
      !template?.headsdownConfig?.idleTasks?.enabled ||
      !template.headsdownConfig.idleTasks.tasks.length
    ) {
      this.events.emit('headsdown:agent:idle', {
        agentId: agent.id,
        reason: 'no_idle_tasks_configured',
      });
      return;
    }

    // Pick first idle task (could be randomized or prioritized)
    const idleTaskType = template.headsdownConfig.idleTasks.tasks[0];

    // Create work item for idle task
    const workItem: WorkItem = {
      id: `idle:${uuidv4()}`,
      type: 'idle_task',
      description: `Perform idle task: ${idleTaskType}`,
      priority: 10, // Low priority
      source: 'idle',
      metadata: {
        type: idleTaskType,
      },
    };

    logger.info(`Agent ${agent.id} performing idle work: ${idleTaskType}`);

    // Execute idle task
    await this.claimAndExecute(agent, workItem);
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

    const consecutiveErrorCount = this.consecutiveErrors.get(agentId) ?? 0;

    const state: HeadsdownState = {
      agentId: agent.id,
      status: agent.status,
      currentTurns: agent.stats.totalTurns,
      consecutiveErrors: consecutiveErrorCount,
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
