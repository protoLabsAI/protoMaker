/**
 * Human-in-the-Loop (HITL) Form Types
 *
 * JSON Schema form system for structured user input during agent execution.
 * Supports single forms and multi-step wizards.
 */

import type { SignalChannel, SignalMetadata } from './signal-channel.js';

/** Who initiated the form request */
export type HITLFormCallerType = 'agent' | 'flow' | 'api';

/** Form lifecycle status */
export type HITLFormStatus = 'pending' | 'submitted' | 'cancelled' | 'expired';

/** A single step in a form (may be 1 of N in a wizard) */
export interface HITLFormStep {
  /** JSON Schema (draft-07) defining the form fields */
  schema: Record<string, unknown>;
  /** @rjsf layout hints (field ordering, widgets, etc.) */
  uiSchema?: Record<string, unknown>;
  /** Step title shown in wizard header */
  title?: string;
  /** Step description shown below title */
  description?: string;
}

/** Input for creating a new form request */
export interface HITLFormRequestInput {
  /** Form dialog title */
  title: string;
  /** Optional description shown below title */
  description?: string;
  /** One or more form steps (>1 = wizard mode) */
  steps: HITLFormStep[];
  /** Who is creating this request */
  callerType: HITLFormCallerType;
  /** Associated feature ID (required for agent caller type) */
  featureId?: string;
  /** Project path context */
  projectPath?: string;
  /** Flow thread ID (for flow caller type) */
  flowThreadId?: string;
  /** Time-to-live in seconds before auto-expiry (default: 3600) */
  ttlSeconds?: number;
  /** Channel to send the form response back to (for cross-channel reply routing) */
  replyChannel?: SignalChannel;
  /** Metadata for routing the form response back to the originating channel */
  replyMetadata?: SignalMetadata;
}

/** Full form request record (stored server-side) */
export interface HITLFormRequest extends HITLFormRequestInput {
  /** Unique form ID */
  id: string;
  /** Current status */
  status: HITLFormStatus;
  /** ISO timestamp when created */
  createdAt: string;
  /** ISO timestamp when user responded */
  respondedAt?: string;
  /** ISO timestamp when form expires */
  expiresAt: string;
  /** User responses — one entry per step */
  response?: Record<string, unknown>[];
}

/** Summary view for listing pending forms */
export interface HITLFormRequestSummary {
  /** Unique form ID */
  id: string;
  /** Form title */
  title: string;
  /** Current status */
  status: HITLFormStatus;
  /** Caller type */
  callerType: HITLFormCallerType;
  /** Associated feature ID */
  featureId?: string;
  /** Number of steps */
  stepCount: number;
  /** ISO timestamp when created */
  createdAt: string;
  /** ISO timestamp when form expires */
  expiresAt: string;
}
