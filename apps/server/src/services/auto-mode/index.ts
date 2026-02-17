/**
 * Auto-Mode Service Modules
 *
 * This directory contains the decomposed auto-mode service, split into focused modules:
 *
 * - types.ts - Shared type definitions
 * - health-monitor.ts - Health checks, capacity tracking, circuit breaker logic
 * - scheduler.ts - Queue management, feature selection, concurrency control
 * - executor.ts - Running feature state management
 * - lifecycle.ts - Start/stop, configuration, state persistence
 *
 * The main AutoModeService in ../auto-mode-service.ts orchestrates these modules.
 */

// Export types
export * from './types.js';

// Export modules
export { AutoModeHealthMonitor } from './health-monitor.js';
export type {
  EventEmitter as HealthMonitorEventEmitter,
  AutoLoopRestarter,
  AutoLoopStopper,
} from './health-monitor.js';

export { AutoModeScheduler } from './scheduler.js';
export type {
  WorktreeBranchesGetter,
  FeatureFinishedChecker,
  FeatureSelectionContext,
} from './scheduler.js';

export { AutoModeExecutor } from './executor.js';
export type { ExecuteOptions, ExecutionResult } from './executor.js';

export { AutoModeLifecycle, DEFAULT_MAX_CONCURRENCY } from './lifecycle.js';
export type { StartConfig, EventEmitter as LifecycleEventEmitter } from './lifecycle.js';
