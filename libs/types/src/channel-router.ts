/**
 * ChannelHandler interface for the Signal-Aware Channel Router.
 *
 * Each ChannelHandler implementation routes HITL interactions (approval requests,
 * forms, notifications) back to the channel where the feature originated.
 */

import type { Feature } from './feature.js';
import type { SignalChannel } from './signal-channel.js';
import type { HITLFormRequestInput } from './hitl-form.js';

/**
 * Handles HITL interactions for a specific communication channel.
 * Implementations route approvals, forms, and notifications to the
 * appropriate external system (UI, Linear, Discord, GitHub, MCP).
 */
export interface ChannelHandler {
  /** The channel this handler is registered for */
  readonly channel: SignalChannel;

  /**
   * Request human approval for a feature.
   * @param feature The feature awaiting approval
   * @param context Additional context about what requires approval
   */
  requestApproval(feature: Feature, context: string): Promise<void>;

  /**
   * Send a structured HITL form for human input.
   * @param feature The feature associated with this form
   * @param formRequest The form definition and steps
   */
  sendHITLForm(feature: Feature, formRequest: HITLFormRequestInput): Promise<void>;

  /**
   * Send a notification about a feature's status or an event.
   * @param feature The feature being reported on
   * @param message The notification message
   */
  sendNotification(feature: Feature, message: string): Promise<void>;

  /**
   * Cancel any pending approval requests or forms for a feature.
   * @param feature The feature to cancel pending interactions for
   */
  cancelPending(feature: Feature): Promise<void>;
}
