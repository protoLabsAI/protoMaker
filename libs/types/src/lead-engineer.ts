/**
 * Lead Engineer Service types
 *
 * The Lead Engineer is the production-phase nerve center.
 * It orchestrates auto-mode, reacts to events with fast-path rules,
 * and wraps up projects with retro + improvement tickets.
 */

import type { FeatureStatus } from './feature.js';

// ────────────────────────── Snapshots ──────────────────────────

/** Per-feature state as seen by the Lead Engineer */
export interface LeadFeatureSnapshot {
  id: string;
  title?: string;
  status: FeatureStatus | string;
  branchName?: string;
  prNumber?: number;
  prUrl?: string;
  prCreatedAt?: string;
  prMergedAt?: string;
  costUsd?: number;
  failureCount?: number;
  dependencies?: string[];
  epicId?: string;
  isEpic?: boolean;
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  startedAt?: string;
  completedAt?: string;
}

/** Running agent snapshot */
export interface LeadAgentSnapshot {
  featureId: string;
  startTime: string;
  branch?: string;
}

/** Open PR snapshot */
export interface LeadPRSnapshot {
  featureId: string;
  prNumber: number;
  prUrl?: string;
  prCreatedAt?: string;
  autoMergeEnabled?: boolean;
  unresolvedThreads?: number;
}

/** Milestone progress snapshot */
export interface LeadMilestoneSnapshot {
  slug: string;
  title: string;
  totalPhases: number;
  completedPhases: number;
}

// ────────────────────────── World State ──────────────────────────

/** Comprehensive state of a managed project */
export interface LeadWorldState {
  projectPath: string;
  projectSlug: string;
  updatedAt: string;

  /** Board counts by status */
  boardCounts: Record<string, number>;

  /** Per-feature state map (featureId → snapshot) */
  features: Record<string, LeadFeatureSnapshot>;

  /** Currently running agents */
  agents: LeadAgentSnapshot[];

  /** Open PRs */
  openPRs: LeadPRSnapshot[];

  /** Milestone progress */
  milestones: LeadMilestoneSnapshot[];

  /** Aggregate metrics */
  metrics: {
    totalFeatures: number;
    completedFeatures: number;
    totalCostUsd: number;
    avgCycleTimeMs?: number;
  };

  /** Auto-mode running? */
  autoModeRunning: boolean;

  /** Max concurrency for auto-mode */
  maxConcurrency: number;
}

// ────────────────────────── Rule Actions ──────────────────────────

/** Discriminated union of actions a rule can emit */
export type LeadRuleAction =
  | { type: 'move_feature'; featureId: string; toStatus: FeatureStatus }
  | { type: 'reset_feature'; featureId: string; reason: string }
  | { type: 'unblock_feature'; featureId: string }
  | { type: 'enable_auto_merge'; featureId: string; prNumber: number }
  | { type: 'resolve_threads'; featureId: string; prNumber: number }
  | { type: 'restart_auto_mode'; projectPath: string; maxConcurrency?: number }
  | { type: 'stop_agent'; featureId: string }
  | { type: 'send_agent_message'; featureId: string; message: string }
  | { type: 'post_discord'; channelId: string; message: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'escalate_llm'; reason: string; context: Record<string, unknown> }
  | { type: 'project_completing' };

// ────────────────────────── Fast-Path Rules ──────────────────────────

/** A fast-path rule: pure function, no LLM, no service imports */
export interface LeadFastPathRule {
  /** Unique rule name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Event types that trigger this rule */
  triggers: string[];
  /** Pure function: given world state + event, return actions (or empty array) */
  evaluate: (
    worldState: LeadWorldState,
    eventType: string,
    eventPayload: unknown
  ) => LeadRuleAction[];
}

// ────────────────────────── Session ──────────────────────────

/** Flow state machine for a managed project */
export type LeadEngineerFlowState = 'idle' | 'running' | 'completing' | 'stopped';

/** Per-project session maintained by the Lead Engineer */
export interface LeadEngineerSession {
  projectPath: string;
  projectSlug: string;
  flowState: LeadEngineerFlowState;
  worldState: LeadWorldState;
  startedAt: string;
  stoppedAt?: string;

  /** Rolling log of rule evaluations (capped at 200) */
  ruleLog: LeadRuleLogEntry[];

  /** Count of actions taken since session start */
  actionsTaken: number;
}

/** Entry in the rule evaluation log */
export interface LeadRuleLogEntry {
  timestamp: string;
  ruleName: string;
  eventType: string;
  actions: LeadRuleAction[];
}
