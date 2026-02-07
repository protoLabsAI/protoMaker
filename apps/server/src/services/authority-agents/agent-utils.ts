/**
 * Shared utilities for authority agents to reduce code duplication.
 *
 * These utilities extract common patterns across PM, ProjM, EM, and Status agents:
 * - State tracking (agents map, initialized projects, processing set)
 * - Initialization pattern (register agent, check initialized)
 * - Processing guards (prevent duplicate processing with try/finally)
 * - Event listener registration
 */

import type { AuthorityAgent, AuthorityRole } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('AgentUtils');

/**
 * Agent state container with type-safe access methods.
 *
 * @example
 * ```typescript
 * class MyAgent {
 *   private state = createAgentState<MyAgent>();
 *
 *   async someMethod(projectPath: string) {
 *     const agent = this.state.getAgent(projectPath);
 *     if (!agent) return;
 *     // use agent...
 *   }
 * }
 * ```
 */
export interface AgentState<T = unknown> {
  /** Map of project paths to registered authority agents */
  agents: Map<string, AuthorityAgent>;

  /** Set of project paths that have been initialized */
  initializedProjects: Set<string>;

  /** Set of IDs currently being processed (prevents duplicate processing) */
  processing: Set<string>;

  /** Custom state specific to the agent type */
  custom: T;

  /** Get registered agent for a project */
  getAgent(projectPath: string): AuthorityAgent | null;

  /** Check if a project is initialized */
  isInitialized(projectPath: string): boolean;

  /** Check if an ID is currently being processed */
  isProcessing(id: string): boolean;

  /** Mark project as initialized */
  markInitialized(projectPath: string): void;

  /** Remove project initialization */
  removeInitialized(projectPath: string): void;
}

/**
 * Create a new agent state container with no custom state.
 *
 * @returns Agent state with standard maps/sets and access methods
 *
 * @example
 * ```typescript
 * const state = createAgentState();
 * ```
 */
export function createAgentState(): AgentState<Record<string, never>>;

/**
 * Create a new agent state container with custom state.
 *
 * @param customState - Custom state specific to the agent type (required when using generics)
 * @returns Agent state with standard maps/sets and access methods
 *
 * @example
 * ```typescript
 * interface MyCustomState {
 *   pollTimers: Map<string, NodeJS.Timeout>;
 * }
 *
 * const state = createAgentState<MyCustomState>({
 *   pollTimers: new Map(),
 * });
 * ```
 */
export function createAgentState<T>(customState: T): AgentState<T>;

// Implementation
export function createAgentState<T = Record<string, never>>(
  customState?: T
): AgentState<T> | AgentState<Record<string, never>> {
  const agents = new Map<string, AuthorityAgent>();
  const initializedProjects = new Set<string>();
  const processing = new Set<string>();
  const custom = (customState ?? {}) as T;

  return {
    agents,
    initializedProjects,
    processing,
    custom,

    getAgent(projectPath: string): AuthorityAgent | null {
      return agents.get(projectPath) ?? null;
    },

    isInitialized(projectPath: string): boolean {
      return initializedProjects.has(projectPath);
    },

    isProcessing(id: string): boolean {
      return processing.has(id);
    },

    markInitialized(projectPath: string): void {
      initializedProjects.add(projectPath);
    },

    removeInitialized(projectPath: string): void {
      initializedProjects.delete(projectPath);
    },
  };
}

/**
 * Options for withProcessingGuard.
 */
export interface ProcessingGuardOptions {
  /** Log when guard blocks duplicate processing (default: true) */
  logBlocked?: boolean;

  /** Custom log message when blocked (default: "Already processing {id}") */
  blockedMessage?: string;
}

/**
 * Wrap a function with a processing guard to prevent duplicate execution.
 *
 * Common pattern in all agents: check if ID is being processed, add to set,
 * execute function, remove from set in finally block.
 *
 * @param state - Agent state containing the processing set
 * @param id - Unique identifier to guard (feature ID, project path, etc.)
 * @param fn - Async function to execute with guard
 * @param options - Optional logging configuration
 * @returns Promise resolving to function result, or undefined if blocked
 *
 * @example
 * ```typescript
 * async processFeature(feature: Feature): Promise<void> {
 *   return withProcessingGuard(this.state, feature.id, async () => {
 *     // This code only runs if feature.id is not already processing
 *     await this.doWork(feature);
 *   });
 * }
 * ```
 */
export async function withProcessingGuard<T>(
  state: AgentState,
  id: string,
  fn: () => Promise<T>,
  options: ProcessingGuardOptions = {}
): Promise<T | undefined> {
  const { logBlocked = true, blockedMessage } = options;

  // Check if already processing
  if (state.isProcessing(id)) {
    if (logBlocked) {
      const msg = blockedMessage ?? `Already processing ${id}`;
      logger.debug(msg);
    }
    return undefined;
  }

  // Add to processing set
  state.processing.add(id);

  try {
    // Execute function
    return await fn();
  } finally {
    // Always remove from processing set
    state.processing.delete(id);
  }
}

/**
 * Options for initializeAgent.
 */
export interface InitializeAgentOptions {
  /** Skip if already initialized (default: true) */
  skipIfInitialized?: boolean;

  /** Log initialization (default: true) */
  logInit?: boolean;

  /** Custom log message (default: "{role} agent registered for project: {agentId}") */
  logMessage?: string;
}

/**
 * Initialize an agent for a project with the standard pattern.
 *
 * Common pattern across all agents:
 * 1. Check if already initialized (return early if yes)
 * 2. Register agent with authority service
 * 3. Store agent in map
 * 4. Mark project as initialized
 * 5. Execute custom setup (role-specific)
 *
 * @param state - Agent state to update
 * @param authorityService - Authority service for agent registration
 * @param role - Agent role (e.g., 'product-manager', 'engineering-manager')
 * @param projectPath - Project path to initialize for
 * @param setup - Optional async setup function called after registration
 * @param options - Optional configuration
 * @returns Registered authority agent
 *
 * @example
 * ```typescript
 * async initialize(projectPath: string): Promise<void> {
 *   await initializeAgent(
 *     this.state,
 *     this.authorityService,
 *     'product-manager',
 *     projectPath,
 *     async (agent) => {
 *       // Custom setup for PM agent
 *       await this.reviewNewFeatures(projectPath);
 *     }
 *   );
 * }
 * ```
 */
export async function initializeAgent(
  state: AgentState,
  authorityService: {
    registerAgent: (role: AuthorityRole, projectPath: string) => Promise<AuthorityAgent>;
  },
  role: AuthorityRole,
  projectPath: string,
  setup?: (agent: AuthorityAgent) => Promise<void>,
  options: InitializeAgentOptions = {}
): Promise<AuthorityAgent> {
  const { skipIfInitialized = true, logInit = true, logMessage } = options;

  // Skip if already initialized
  if (skipIfInitialized && state.isInitialized(projectPath)) {
    const agent = state.getAgent(projectPath);
    if (!agent) {
      throw new Error(`Project ${projectPath} marked initialized but no agent found`);
    }
    return agent;
  }

  // Register agent with authority service
  const agent = await authorityService.registerAgent(role, projectPath);

  // Execute custom setup first (before persisting state)
  // This ensures atomicity: if setup fails, we don't mark as initialized
  if (setup) {
    try {
      await setup(agent);
    } catch (error) {
      // Setup failed - don't persist state
      logger.error(`Agent setup failed for ${projectPath}, not persisting state:`, error);
      throw error;
    }
  }

  // Only persist state after successful setup
  state.agents.set(projectPath, agent);
  state.markInitialized(projectPath);

  // Log initialization
  if (logInit) {
    const msg = logMessage ?? `${role} agent registered for project: ${agent.id}`;
    logger.info(msg);
  }

  return agent;
}

/**
 * Options for registerEventListener.
 */
export interface RegisterEventListenerOptions {
  /** Skip if listener already registered (default: true) */
  skipIfRegistered?: boolean;

  /** Initialize projects from event data (default: true) */
  autoInitialize?: boolean;

  /** Extract project path from event data (default: event => event.projectPath) */
  getProjectPath?: (event: unknown) => string | undefined;

  /** Filter function to determine if event should be processed (default: all events) */
  filter?: (event: unknown) => boolean;
}

/**
 * Event emitter interface with unsubscribe support.
 */
export interface EventEmitterWithUnsubscribe {
  subscribe: <T>(event: string, handler: (data: T) => void | Promise<void>) => () => void;
}

/**
 * Register an event listener with common patterns.
 *
 * Common pattern across agents:
 * 1. Check if listener already registered (return early if yes)
 * 2. Subscribe to event with handler
 * 3. Auto-initialize projects from event data
 * 4. Set listener registered flag
 *
 * @param state - Agent state
 * @param getListenerRegistered - Function to check if listener is registered
 * @param setListenerRegistered - Function to set listener registered flag
 * @param events - Event emitter with subscribe method that returns unsubscribe function
 * @param eventName - Name of event to subscribe to
 * @param handler - Event handler function
 * @param initialize - Initialize function for auto-initialization
 * @param options - Optional configuration
 * @returns Unsubscribe function to remove the listener
 *
 * @example
 * ```typescript
 * setupEventListeners(): void {
 *   const unsubscribe = registerEventListener(
 *     this.state,
 *     () => this.listenerRegistered,
 *     (val) => { this.listenerRegistered = val; },
 *     this.events,
 *     'feature:created',
 *     async (event) => {
 *       await this.reviewFeature(event.projectPath, event.featureId);
 *     },
 *     (projectPath) => this.initialize(projectPath)
 *   );
 *
 *   // Later, to cleanup:
 *   // unsubscribe();
 * }
 * ```
 */
export function registerEventListener<T>(
  state: AgentState,
  getListenerRegistered: () => boolean,
  setListenerRegistered: (value: boolean) => void,
  events: EventEmitterWithUnsubscribe,
  eventName: string,
  handler: (event: T) => void | Promise<void>,
  initialize: (projectPath: string) => Promise<void>,
  options: RegisterEventListenerOptions = {}
): () => void {
  const { skipIfRegistered = true, autoInitialize = true, getProjectPath, filter } = options;

  // Skip if already registered
  if (skipIfRegistered && getListenerRegistered()) {
    return () => {
      /* Already registered, no-op unsubscribe */
    };
  }

  // Default project path extractor
  const extractProjectPath =
    getProjectPath ?? ((event: unknown) => (event as { projectPath?: string }).projectPath);

  // Subscribe to event and capture unsubscribe function
  const unsubscribe = events.subscribe(eventName, async (event: T) => {
    // Apply filter if provided
    if (filter && !filter(event)) {
      return;
    }

    // Auto-initialize if enabled
    if (autoInitialize) {
      const projectPath = extractProjectPath(event);
      if (projectPath && !state.isInitialized(projectPath)) {
        try {
          await initialize(projectPath);
        } catch (error) {
          logger.error(`Failed to auto-initialize for ${eventName} event:`, error);
          return;
        }
      }
    }

    // Call handler
    try {
      await handler(event);
    } catch (error) {
      logger.error(`Error in ${eventName} handler:`, error);
    }
  });

  // Mark listener as registered
  setListenerRegistered(true);

  // Return cleanup function
  return () => {
    unsubscribe();
    setListenerRegistered(false);
  };
}
