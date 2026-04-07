/**
 * Discord Bot Service — Webhook-based stub
 *
 * This service has been migrated from a full discord.js Client to a webhook-only
 * outbound notification model. protoBot now runs exclusively in Workstacean's bot pool.
 *
 * Outbound channel messages: delegated to discord-webhook.service.ts (HTTP POST).
 * Interactive flows (gate holds, HITL): routed through Workstacean via hitl-gate.service.ts.
 * Read operations (readMessages, readDMs): not supported — return empty results.
 * DM sends: not supported via webhook — return false.
 *
 * The class name and public interface are preserved so all existing importers
 * (services.ts, notification-router.ts, escalation channels, etc.) continue to compile.
 */

import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { AuthorityService } from './authority-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import {
  sendToChannelViaWebhook,
  sendEmbedViaWebhook,
  type WebhookEmbed,
} from './discord-webhook.service.js';
import { HITLGateService } from './hitl-gate.service.js';

const logger = createLogger('DiscordBot');

/** Fallback channel IDs from environment variables */
const ENV_CHANNELS = {
  suggestions: process.env.DISCORD_CHANNEL_SUGGESTIONS || '',
  projectPlanning: process.env.DISCORD_CHANNEL_PROJECT_PLANNING || '',
  agentLogs: process.env.DISCORD_CHANNEL_AGENT_LOGS || '',
  dev: process.env.DISCORD_CHANNEL_CODE_REVIEW || '',
  bugs: process.env.DISCORD_BUGS_CHANNEL_ID || '',
  infra: process.env.DISCORD_CHANNEL_INFRA || '',
} as const;

// Re-export WebhookEmbed as EmbedData for callers that use the embed shape
export type { WebhookEmbed };

export class DiscordBotService {
  private readonly events: EventEmitter;
  private readonly settingsService: SettingsService;
  private readonly hitlGateService: HITLGateService;

  constructor(
    events: EventEmitter,
    _authorityService: AuthorityService,
    _featureLoader: FeatureLoader,
    settingsService: SettingsService,
    _projectPath: string,
    _agents?: unknown
  ) {
    this.events = events;
    this.settingsService = settingsService;
    this.hitlGateService = new HITLGateService();

    logger.info(
      'DiscordBotService initialized in webhook-only mode — protoBot runs in Workstacean'
    );
  }

  /**
   * No-op: protoBot connects from Workstacean, not from protomaker.
   * Always returns false — no discord.js connection is made here.
   */
  async initialize(): Promise<boolean> {
    logger.info('DiscordBotService.initialize() — webhook mode, no discord.js connection');
    return false;
  }

  /**
   * Resolve a Discord channel ID by name.
   * Priority: global settings (discord.channels) → env var fallback → undefined.
   */
  async getChannelId(name: string): Promise<string | undefined> {
    try {
      const settings = await this.settingsService.getGlobalSettings();
      const fromSettings =
        settings.discord?.channels?.[name as keyof typeof settings.discord.channels];
      if (fromSettings) return fromSettings;
    } catch {
      // settings unavailable — fall through to env var
    }
    const fromEnv = ENV_CHANNELS[name as keyof typeof ENV_CHANNELS];
    return fromEnv || undefined;
  }

  /**
   * No-op: gate resolver is not needed in webhook/Workstacean mode.
   * Reactions are handled by Workstacean's hitl plugin.
   */
  setGateResolver(
    _fn: (featureId: string, projectPath: string, action: 'advance' | 'reject') => Promise<void>
  ): void {
    // Gate resolution is now routed through Workstacean's hitl plugin
  }

  /**
   * Publish a gate-hold approval request to Workstacean's hitl plugin.
   * Returns a synthetic gate ID on success, null on failure.
   */
  async postGateHoldMessage(
    channelId: string,
    featureId: string,
    projectPath: string,
    featureTitle?: string,
    phase?: string
  ): Promise<string | null> {
    const ok = await this.hitlGateService.requestGateHold({
      featureId,
      projectPath,
      featureTitle,
      channelId,
      phase,
    });

    if (ok) {
      // Return a synthetic ID so callers that store it don't throw
      return `gate:${featureId}`;
    }
    return null;
  }

  /**
   * Cancel a pending gate-hold via Workstacean.
   */
  async editGateMessage(_featureId: string, _content: string): Promise<void> {
    // In webhook mode, gate resolution is signalled by cancelling via Workstacean.
    // The message content update is handled by Workstacean's hitl plugin.
    logger.debug(`editGateMessage: gate ${_featureId} — Workstacean manages the Discord message`);
    await this.hitlGateService.cancelGateHold(_featureId);
  }

  /** Gate message IDs are not tracked locally in webhook mode. */
  getGateMessageId(_featureId: string): string | undefined {
    return undefined;
  }

  /** Gate channel IDs are not tracked locally in webhook mode. */
  getGateMessageChannelId(_featureId: string): string | undefined {
    return undefined;
  }

  /**
   * Not supported in webhook mode — returns null immediately.
   * HITL reply flows are handled by Workstacean.
   */
  waitForReply(_channelId: string, _timeoutMs: number = 5 * 60 * 1000): Promise<string | null> {
    logger.debug('waitForReply: not supported in webhook mode — HITL handled by Workstacean');
    return Promise.resolve(null);
  }

  /**
   * Send a plain-text message to a channel via webhook.
   */
  async sendToChannel(channelId: string, content: string): Promise<boolean> {
    return sendToChannelViaWebhook(channelId, content);
  }

  /**
   * Send an embed message to a channel via webhook.
   */
  async sendEmbed(
    channelId: string,
    embed: {
      title?: string;
      description?: string;
      color?: number;
      fields?: Array<{ name: string; value: string; inline?: boolean }>;
      footer?: { text: string };
      timestamp?: string;
    }
  ): Promise<boolean> {
    return sendEmbedViaWebhook(channelId, embed);
  }

  /**
   * Not supported in webhook mode — DMs require a bot connection.
   * Returns false to signal the caller that DM delivery did not occur.
   */
  async sendDM(username: string, _content: string): Promise<boolean> {
    logger.warn(
      `sendDM to ${username}: DM delivery not supported in webhook mode — protoBot runs in Workstacean`
    );
    return false;
  }

  /**
   * Not supported in webhook mode — reading messages requires bot access.
   * Returns empty array.
   */
  async readMessages(
    _channelId: string,
    _limit: number = 10
  ): Promise<
    Array<{
      id: string;
      content: string;
      author: { id: string; username: string; bot: boolean };
      timestamp: string;
      mentions: string[];
      hasAttachments: boolean;
    }>
  > {
    return [];
  }

  /**
   * Not supported in webhook mode — reading DMs requires bot access.
   * Returns empty array.
   */
  async readDMs(
    _username: string,
    _limit: number = 10
  ): Promise<Array<{ id: string; content: string; author: string; timestamp: string }>> {
    return [];
  }

  /**
   * Not supported in webhook mode — adding reactions requires bot access.
   * Returns false.
   */
  async addReaction(_channelId: string, _messageId: string, _emoji: string): Promise<boolean> {
    return false;
  }

  /**
   * Not supported in webhook mode — creating threads requires bot access.
   * Returns null.
   */
  async createThread(
    _channelId: string,
    _messageId: string,
    _name: string
  ): Promise<string | null> {
    return null;
  }

  /**
   * Returns true — webhooks are always "connected" (no bot session to lose).
   */
  isConnected(): boolean {
    return true;
  }

  /**
   * No-op: no discord.js connection to tear down.
   */
  async stop(): Promise<void> {
    logger.debug('DiscordBotService.stop() — no discord.js connection to tear down');
  }
}
