/**
 * Automation types - Trigger-based automation definitions and run records
 */

import type { EventType } from './event.js';
import type { PhaseModelEntry } from './agent-settings.js';

// ============================================================================
// Automation Trigger Types
// ============================================================================

/** Cron-based trigger fires on a schedule expression */
export interface CronTrigger {
  type: 'cron';
  expression: string; // Standard cron expression (e.g. "0 * * * *")
}

/** Event-based trigger fires when a matching event is emitted */
export interface EventTrigger {
  type: 'event';
  eventType: EventType;
}

/** Webhook trigger fires when a POST request hits the given path */
export interface WebhookTrigger {
  type: 'webhook';
  path: string; // URL path segment (e.g. "/automations/my-hook")
}

/** Union of all supported trigger types */
export type AutomationTrigger = CronTrigger | EventTrigger | WebhookTrigger;

// ============================================================================
// Automation Run Record
// ============================================================================

export type AutomationRunStatus = 'success' | 'failure' | 'running' | 'cancelled';

/** A single recorded run of an automation */
export interface AutomationRunRecord {
  id: string;
  automationId: string;
  status: AutomationRunStatus;
  startedAt: string; // ISO 8601
  completedAt?: string; // ISO 8601
  error?: string;
  output?: unknown;
}

// ============================================================================
// Automation Interface
// ============================================================================

/** An automation definition stored in .automaker/automations/{id}.json */
export interface Automation {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;

  /** What triggers this automation to run */
  trigger: AutomationTrigger;

  /** ID of the flow to execute when triggered */
  flowId: string;

  /** Model configuration used during execution */
  modelConfig: PhaseModelEntry;

  /** Optional JSON schema describing the expected input payload */
  inputSchema?: Record<string, unknown>;

  tags?: string[];
  metadata?: Record<string, unknown>;

  lastRunAt?: string; // ISO 8601
  nextRunAt?: string; // ISO 8601
  lastRunStatus?: AutomationRunStatus;

  /** True for system-managed automations (built-in maintenance tasks). Cannot be deleted via API. */
  isBuiltIn?: boolean;

  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ============================================================================
// API Input Types — supplementary types for REST API layer
// ============================================================================

/**
 * Input for creating a new automation via POST /api/automations/create
 */
export interface CreateAutomationInput {
  name: string;
  description?: string;
  flowId: string;
  trigger: CronTriggerInput | EventTriggerInput | WebhookTriggerInput;
  enabled?: boolean;
  modelConfig?: Record<string, unknown>;
}

/** Cron trigger input */
export interface CronTriggerInput {
  type: 'cron';
  expression: string;
}

/** Event trigger input */
export interface EventTriggerInput {
  type: 'event';
  eventType: string;
}

/** Webhook trigger input */
export interface WebhookTriggerInput {
  type: 'webhook';
  path: string;
}

/**
 * Input for updating an automation via PUT /api/automations/:id
 */
export interface UpdateAutomationInput {
  name?: string;
  description?: string;
  flowId?: string;
  trigger?: CronTriggerInput | EventTriggerInput | WebhookTriggerInput;
  enabled?: boolean;
  modelConfig?: Record<string, unknown>;
}

/**
 * Type for a flow factory function stored in the FlowRegistry.
 * Receives optional model config and executes the flow.
 */
export type FlowFactory = (modelConfig?: Record<string, unknown>) => Promise<void>;
