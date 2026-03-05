/**
 * ChannelRouter — Signal-Aware HITL Routing
 *
 * Maintains a registry of ChannelHandler implementations and routes HITL
 * interactions (approval requests, forms, notifications) back to the channel
 * where the feature originated.
 *
 * Usage:
 *   channelRouter.register(new DiscordChannelHandler(discordBot));
 *   channelRouter.getHandler(feature).requestApproval(feature, context);
 */

import { createLogger } from '@protolabsai/utils';
import type {
  ChannelHandler,
  Feature,
  HITLFormRequestInput,
  SignalChannel,
} from '@protolabsai/types';

const logger = createLogger('ChannelRouter');

/**
 * UIChannelHandler — default handler for features originating from the UI
 * or any feature without a specific channel handler registered.
 *
 * All methods are no-ops because the UI receives gate and form events
 * through the existing WebSocket event pipeline:
 * - Gate holds → pipeline:gate-waiting (emitted by PipelineOrchestrator)
 * - HITL forms → hitl:form-requested (emitted by HITLFormService)
 */
class UIChannelHandler implements ChannelHandler {
  readonly channel: SignalChannel = 'ui';

  async requestApproval(_feature: Feature, _context: string): Promise<void> {
    // No-op: UI already receives pipeline:gate-waiting from PipelineOrchestrator
    logger.debug(`[ui] requestApproval: already handled via pipeline:gate-waiting`);
  }

  async sendHITLForm(_feature: Feature, _formRequest: HITLFormRequestInput): Promise<void> {
    // No-op: UI already receives hitl:form-requested from HITLFormService
    logger.debug(`[ui] sendHITLForm: already handled via hitl:form-requested`);
  }

  async sendNotification(_feature: Feature, _message: string): Promise<void> {
    // No-op: UI notifications are handled through other event channels
    logger.debug(`[ui] sendNotification: no-op for UI channel`);
  }

  async cancelPending(_feature: Feature): Promise<void> {
    // No-op: UI forms expire via TTL
    logger.debug(`[ui] cancelPending: no-op for UI channel`);
  }
}

/**
 * Routes HITL interactions to the appropriate channel handler.
 *
 * Handlers are registered by channel name. When a feature has a sourceChannel,
 * the matching handler is used. Falls back to the UIChannelHandler for features
 * without a sourceChannel or without a registered handler.
 */
export class ChannelRouter {
  private handlers = new Map<SignalChannel, ChannelHandler>();
  private uiHandler: UIChannelHandler;

  constructor() {
    this.uiHandler = new UIChannelHandler();
    this.register(this.uiHandler);
  }

  /**
   * Register a channel handler. Replaces any existing handler for the same channel.
   */
  register(handler: ChannelHandler): void {
    this.handlers.set(handler.channel, handler);
    logger.debug(`Registered handler for channel: ${handler.channel}`);
  }

  /**
   * Get the handler for a feature based on its sourceChannel.
   * Falls back to the UI handler if no sourceChannel or no matching handler.
   */
  getHandler(feature: Feature): ChannelHandler {
    if (feature.sourceChannel) {
      const handler = this.handlers.get(feature.sourceChannel);
      if (handler) return handler;
      logger.warn(`No handler for channel "${feature.sourceChannel}", falling back to UI`);
    }
    return this.uiHandler;
  }

  /**
   * Get the handler for a specific channel by name.
   * Falls back to the UI handler if no matching handler is registered.
   */
  getHandlerByChannel(channel: SignalChannel): ChannelHandler {
    return this.handlers.get(channel) ?? this.uiHandler;
  }
}
