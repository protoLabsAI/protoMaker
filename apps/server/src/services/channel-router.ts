/**
 * ChannelRouter — Signal-Aware HITL Channel Router
 *
 * Resolves the correct ChannelHandler for a feature based on its sourceChannel.
 * Falls back to UIChannelHandler when no handler is registered for the channel
 * or when the feature has no sourceChannel set.
 */

import { createLogger } from '@protolabs-ai/utils';
import type {
  Feature,
  SignalChannel,
  ChannelHandler,
  HITLFormRequestInput,
} from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('ChannelRouter');

/**
 * UI (web frontend) pass-through handler.
 * Emits the existing event bus events that the frontend already listens to.
 */
export class UIChannelHandler implements ChannelHandler {
  readonly channel: SignalChannel = 'ui';

  constructor(private readonly events: EventEmitter) {}

  async requestApproval(feature: Feature, context: string): Promise<void> {
    logger.debug(`requestApproval: feature ${feature.id} — ${context}`);
    this.events.emit('feature:verify-pending', {
      featureId: feature.id,
      featureTitle: feature.title,
      context,
    });
  }

  async sendHITLForm(feature: Feature, formRequest: HITLFormRequestInput): Promise<void> {
    logger.debug(`sendHITLForm: feature ${feature.id} — ${formRequest.title}`);
    this.events.emit('hitl:form-requested', {
      formId: formRequest.featureId ?? feature.id,
      title: formRequest.title,
      callerType: formRequest.callerType,
      featureId: feature.id,
      projectPath: formRequest.projectPath,
      stepCount: formRequest.steps?.length ?? 0,
      expiresAt: new Date(Date.now() + (formRequest.ttlSeconds ?? 3600) * 1000).toISOString(),
    });
  }

  async sendNotification(feature: Feature, message: string): Promise<void> {
    logger.debug(`sendNotification: feature ${feature.id} — ${message}`);
    // UI notifications are surfaced via the feature event stream; no additional action needed.
  }

  async cancelPending(feature: Feature): Promise<void> {
    logger.debug(`cancelPending: feature ${feature.id}`);
    // UI has no persistent pending state to cancel beyond the event stream.
  }
}

/**
 * Routes HITL interactions to the correct handler based on a feature's sourceChannel.
 */
export class ChannelRouter {
  private readonly handlers = new Map<SignalChannel, ChannelHandler>();
  private readonly uiHandler: UIChannelHandler;

  constructor(events: EventEmitter) {
    this.uiHandler = new UIChannelHandler(events);
  }

  /**
   * Register a handler for a specific channel.
   * Overwrites any previously registered handler for that channel.
   */
  registerHandler(channel: SignalChannel, handler: ChannelHandler): void {
    logger.info(`Registering handler for channel: ${channel}`);
    this.handlers.set(channel, handler);
  }

  /**
   * Resolve the handler for a feature.
   * Returns the registered handler for feature.sourceChannel, or UIChannelHandler
   * if no sourceChannel is set or no handler is registered for that channel.
   */
  getHandler(feature: Feature): ChannelHandler {
    const channel = feature.sourceChannel;
    if (channel && this.handlers.has(channel)) {
      return this.handlers.get(channel)!;
    }
    if (channel && channel !== 'ui') {
      logger.debug(
        `No handler registered for channel "${channel}" on feature ${feature.id} — falling back to UIChannelHandler`
      );
    }
    return this.uiHandler;
  }
}
