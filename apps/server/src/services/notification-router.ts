/**
 * NotificationRouter - Routes feature completion/failure/HITL events
 * based on the current user presence state.
 *
 * Presence states are derived from SensorRegistryService readings:
 *   active   → in-app toast only
 *   idle     → in-app toast + browser push
 *   afk      → Discord DM (falls back to toast if Discord unavailable)
 *   headless → Discord DM only (no browser connected)
 *
 * Falls back to in-app toast only when the router is disabled
 * (userPresenceDetection flag is off).
 *
 * The router subscribes to:
 *   - feature:completed  → routes a success notification
 *   - feature:error      → routes a failure notification
 *   - hitl:form-requested → routes a human-input-required notification
 */

import { createLogger } from '@protolabs-ai/utils';
import type { EventType, NotificationType } from '@protolabs-ai/types';
import type { SensorRegistryService } from './sensor-registry-service.js';
import type { NotificationService } from './notification-service.js';
import type { DiscordBotService } from './discord-bot-service.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('NotificationRouter');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Computed presence state derived from sensor readings.
 *
 * - active:   browser is visible and user is interacting
 * - idle:     browser is open but user has not interacted for >1 min
 * - afk:      browser is open but user has been gone >5 min
 * - headless: no browser sensors are connected (server-only / CI)
 */
export type NotificationPresenceState = 'active' | 'idle' | 'afk' | 'headless';

/** A notification event that should be routed to the user. */
export interface NotificationEvent {
  /** Category of the event driving the notification. */
  type: 'completion' | 'failure' | 'hitl';
  /** Short title shown in the notification. */
  title: string;
  /** Descriptive message body. */
  message: string;
  /** Optional feature ID for cross-linking. */
  featureId?: string;
  /** Project path required to persist via NotificationService. */
  projectPath?: string;
}

/** Configuration for the NotificationRouter. */
export interface NotificationRouterConfig {
  /**
   * Discord usernames to send DMs to when presence is 'afk' or 'headless'.
   * Ignored if no DiscordBotService is provided.
   */
  discordRecipients?: string[];
  /**
   * When false, all events fall back to in-app toast regardless of presence.
   * Set to false when the userPresenceDetection feature flag is disabled.
   * @default true
   */
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// NotificationRouter
// ---------------------------------------------------------------------------

export class NotificationRouter {
  private readonly sensorRegistry: SensorRegistryService;
  private readonly notificationService: NotificationService;
  private readonly events: EventEmitter;
  private readonly discordBot?: DiscordBotService;
  private readonly discordRecipients: string[];
  private readonly enabled: boolean;

  constructor(
    sensorRegistry: SensorRegistryService,
    notificationService: NotificationService,
    events: EventEmitter,
    discordBot?: DiscordBotService,
    config?: NotificationRouterConfig
  ) {
    this.sensorRegistry = sensorRegistry;
    this.notificationService = notificationService;
    this.events = events;
    this.discordBot = discordBot;
    this.discordRecipients = config?.discordRecipients ?? [];
    this.enabled = config?.enabled ?? true;

    this.subscribeToEvents();
    logger.info(
      `NotificationRouter initialized (enabled=${this.enabled}, ` +
        `discordRecipients=[${this.discordRecipients.join(', ')}])`
    );
  }

  // ---------------------------------------------------------------------------
  // Presence detection
  // ---------------------------------------------------------------------------

  /**
   * Compute the current user presence state from SensorRegistryService.
   *
   * Uses the 'builtin:user-activity' sensor (reported by the usePresence hook)
   * to determine activity level.  Returns 'headless' when the sensor is absent
   * or offline — indicating no browser client is connected.
   */
  computePresenceState(): NotificationPresenceState {
    const entry = this.sensorRegistry.get('builtin:user-activity');

    if (!entry || entry.state === 'offline') {
      return 'headless';
    }

    const status = entry.reading?.data?.status as string | undefined;

    if (status === 'afk') return 'afk';
    if (status === 'idle') return 'idle';
    if (status === 'active') return 'active';

    // Sensor is registered but hasn't reported a known status yet
    return 'headless';
  }

  // ---------------------------------------------------------------------------
  // Public routing API
  // ---------------------------------------------------------------------------

  /**
   * Route a notification event to the appropriate channel based on the
   * current user presence state.
   *
   * When the router is disabled (userPresenceDetection off), the event is
   * always sent as an in-app toast — preserving backward-compatible behaviour.
   */
  async route(event: NotificationEvent): Promise<void> {
    if (!this.enabled) {
      await this.sendInAppToast(event);
      return;
    }

    const presence = this.computePresenceState();
    logger.info(`Routing ${event.type} notification [presence=${presence}]: "${event.title}"`);

    switch (presence) {
      case 'active':
        await this.sendInAppToast(event);
        break;

      case 'idle':
        await this.sendInAppToast(event);
        await this.sendBrowserPush(event);
        break;

      case 'afk':
        await this.sendDiscordDM(event);
        break;

      case 'headless':
        await this.sendDiscordDM(event);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Private delivery helpers
  // ---------------------------------------------------------------------------

  /** Persist to NotificationService (and emit notification:created via events). */
  private async sendInAppToast(event: NotificationEvent): Promise<void> {
    if (event.projectPath) {
      try {
        await this.notificationService.createNotification({
          type: this.toNotificationType(event.type),
          title: event.title,
          message: event.message,
          featureId: event.featureId,
          projectPath: event.projectPath,
        });
      } catch (error) {
        logger.error('Failed to create in-app notification:', error);
      }
    } else {
      // No projectPath: emit a lightweight event so connected WebSocket clients
      // still receive the toast without persisting to disk.
      this.events.emit('notification:created', {
        type: this.toNotificationType(event.type),
        title: event.title,
        message: event.message,
        featureId: event.featureId,
      });
    }
  }

  /** Emit a push notification request for the browser push API handler. */
  private sendBrowserPush(event: NotificationEvent): void {
    // notification:push-requested is handled by the WebSocket layer to trigger
    // the browser's Push API on connected clients.
    this.events.emit('notification:push-requested' as EventType, {
      title: event.title,
      message: event.message,
      type: event.type,
      featureId: event.featureId,
      projectPath: event.projectPath,
    });
  }

  /** Send a Discord DM to all configured recipients. */
  private async sendDiscordDM(event: NotificationEvent): Promise<void> {
    const bot = this.discordBot;
    if (!bot || !bot.isConnected() || this.discordRecipients.length === 0) {
      logger.warn(
        'Discord DM unavailable (bot not connected or no recipients configured), ' +
          'falling back to in-app toast'
      );
      await this.sendInAppToast(event);
      return;
    }

    const message = this.formatDiscordMessage(event);

    await Promise.all(
      this.discordRecipients.map(async (username) => {
        try {
          const sent = await bot.sendDM(username, message);
          if (sent) {
            logger.info(`Discord DM sent to @${username}: "${event.title}"`);
          } else {
            logger.error(`Discord DM failed (bot returned false) for @${username}`);
          }
        } catch (error) {
          logger.error(`Discord DM error for @${username}:`, error);
        }
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Event subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to relevant system events and route them as notifications.
   *
   * Subscriptions:
   *   feature:completed     → completion notification
   *   feature:error         → failure notification
   *   hitl:form-requested   → HITL / human-input-required notification
   */
  private subscribeToEvents(): void {
    this.events.subscribe((type, payload) => {
      if (type === 'feature:completed') {
        const data = payload as {
          featureId?: string;
          featureTitle?: string;
          projectPath?: string;
        };
        void this.route({
          type: 'completion',
          title: 'Feature Completed',
          message: data.featureTitle
            ? `"${data.featureTitle}" completed successfully.`
            : 'A feature completed successfully.',
          featureId: data.featureId,
          projectPath: data.projectPath,
        });
      } else if (type === 'feature:error') {
        const data = payload as {
          featureId?: string;
          featureTitle?: string;
          projectPath?: string;
          error?: string;
        };
        void this.route({
          type: 'failure',
          title: 'Feature Failed',
          message: data.featureTitle
            ? `"${data.featureTitle}" encountered an error.`
            : `Feature failed: ${data.error ?? 'unknown error'}`,
          featureId: data.featureId,
          projectPath: data.projectPath,
        });
      } else if (type === 'hitl:form-requested') {
        const data = payload as {
          featureId?: string;
          projectPath?: string;
          title?: string;
        };
        void this.route({
          type: 'hitl',
          title: 'Human Input Required',
          message: data.title ?? 'An agent is waiting for your input.',
          featureId: data.featureId,
          projectPath: data.projectPath,
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Format a Discord DM message for the given notification event. */
  private formatDiscordMessage(event: NotificationEvent): string {
    const emoji = event.type === 'completion' ? '✅' : event.type === 'failure' ? '❌' : '⚠️';
    let message = `${emoji} **${event.title}**\n${event.message}`;
    if (event.featureId) {
      message += `\n_Feature: \`${event.featureId}\`_`;
    }
    return message;
  }

  /** Map a NotificationEvent type to the closest NotificationType. */
  private toNotificationType(type: NotificationEvent['type']): NotificationType {
    switch (type) {
      case 'completion':
        return 'agent_complete';
      case 'failure':
        return 'agent_complete';
      case 'hitl':
        return 'feature_waiting_approval';
      default:
        return 'agent_complete';
    }
  }
}
