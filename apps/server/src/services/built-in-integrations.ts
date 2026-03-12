/**
 * Built-in Integration Descriptors
 *
 * Registers the Phase 1 integrations (Discord, GitHub) at tier 0.
 * Health check wiring connects to the existing IntegrationService methods.
 */

import type { IntegrationDescriptor, IntegrationHealth } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { IntegrationRegistryService } from './integration-registry-service.js';
import { integrationService } from './integration-service.js';

const logger = createLogger('BuiltInIntegrations');

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

const DISCORD_DESCRIPTOR: IntegrationDescriptor = {
  id: 'discord',
  name: 'Discord',
  description: 'Chat notifications, agent threads, and approval routing',
  category: 'communication',
  scope: 'both',
  tier: 0,
  iconName: 'MessageCircle',
  brandColor: '#5865F2',
  enabled: false,
  hasHealthCheck: true,
  docsUrl: '/docs/integrations/discord',
  tags: ['chat', 'notifications', 'bot'],
  configFields: [
    {
      key: 'serverId',
      label: 'Server ID',
      type: 'string',
      description: 'Discord guild (server) ID',
      required: true,
      placeholder: '123456789012345678',
      group: 'Connection',
    },
    {
      key: 'channelId',
      label: 'Notification Channel ID',
      type: 'string',
      description: 'Default channel for notifications',
      placeholder: '123456789012345678',
      group: 'Connection',
    },
    {
      key: 'botToken',
      label: 'Bot Token',
      type: 'secret',
      description: 'Discord bot token (stored in credentials)',
      group: 'Connection',
    },
    {
      key: 'notifyOnCompletion',
      label: 'Notify on completion',
      type: 'boolean',
      defaultValue: true,
      group: 'Notifications',
    },
    {
      key: 'notifyOnError',
      label: 'Notify on error',
      type: 'boolean',
      defaultValue: true,
      group: 'Notifications',
    },
    {
      key: 'notifyOnAutoModeComplete',
      label: 'Notify when auto-mode completes',
      type: 'boolean',
      defaultValue: true,
      group: 'Notifications',
    },
    {
      key: 'createThreadsForAgents',
      label: 'Create threads for agents',
      type: 'boolean',
      defaultValue: true,
      group: 'Behavior',
    },
  ],
};

const GITHUB_DESCRIPTOR: IntegrationDescriptor = {
  id: 'github',
  name: 'GitHub',
  description: 'Webhooks, PR management, and repository operations',
  category: 'source-control',
  scope: 'global',
  tier: 0,
  iconName: 'Github',
  brandColor: '#24292F',
  enabled: false,
  hasHealthCheck: true,
  docsUrl: '/docs/integrations/github',
  tags: ['git', 'pr', 'webhooks'],
  configFields: [
    {
      key: 'webhookEnabled',
      label: 'Enable webhooks',
      type: 'boolean',
      defaultValue: false,
      description: 'Receive GitHub webhook events',
      group: 'Webhooks',
    },
    {
      key: 'webhookSecret',
      label: 'Webhook Secret',
      type: 'secret',
      description: 'Secret for verifying webhook payloads',
      group: 'Webhooks',
    },
  ],
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all built-in integration descriptors.
 * Returns the number of successfully registered integrations.
 */
export function registerBuiltInIntegrations(registry: IntegrationRegistryService): number {
  const descriptors = [DISCORD_DESCRIPTOR, GITHUB_DESCRIPTOR];
  let count = 0;

  for (const descriptor of descriptors) {
    const result = registry.register(descriptor);
    if (result.success) {
      count++;
    } else {
      logger.error(`Failed to register "${descriptor.id}": ${result.error}`);
    }
  }

  logger.info(`Registered ${count} built-in integrations`);
  return count;
}

// ---------------------------------------------------------------------------
// Health check wiring
// ---------------------------------------------------------------------------

/**
 * Wire health check functions to the registry using the existing IntegrationService.
 * Call this after integrationService.initialize() has been called.
 */
export function wireHealthChecks(registry: IntegrationRegistryService): void {
  registry.registerHealthCheck('discord', async (): Promise<IntegrationHealth> => {
    const online = await integrationService.checkDiscordBotStatus();
    return {
      integrationId: 'discord',
      status: online ? 'connected' : 'disconnected',
      message: online ? 'Bot is online' : 'Bot is offline',
      checkedAt: new Date().toISOString(),
    };
  });

  registry.registerHealthCheck('github', async (): Promise<IntegrationHealth> => {
    const authenticated = await integrationService.checkGitHubAuthStatus();
    return {
      integrationId: 'github',
      status: authenticated ? 'connected' : 'disconnected',
      message: authenticated ? 'GitHub CLI authenticated' : 'GitHub CLI not authenticated',
      checkedAt: new Date().toISOString(),
    };
  });

  logger.info('Wired health checks for Discord, GitHub');
}
