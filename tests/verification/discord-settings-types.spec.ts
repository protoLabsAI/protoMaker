/**
 * Verification test for Discord Settings Types
 *
 * This test verifies that the Discord configuration types are properly integrated
 * into the settings system and can be read/written correctly.
 */

import { test, expect } from '@playwright/test';
import type {
  DiscordSettings,
  GlobalSettings,
  ProjectSettings,
  Credentials,
} from '@protolabs-ai/types';
import { DEFAULT_DISCORD_SETTINGS } from '@protolabs-ai/types';

test.describe('Discord Settings Types', () => {
  test('DEFAULT_DISCORD_SETTINGS has correct structure', () => {
    // Verify the default Discord settings structure
    expect(DEFAULT_DISCORD_SETTINGS).toBeDefined();
    expect(DEFAULT_DISCORD_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_DISCORD_SETTINGS.tokenConfigured).toBe(false);
    expect(DEFAULT_DISCORD_SETTINGS.autoNotify).toBe(false);
    expect(DEFAULT_DISCORD_SETTINGS.notifyOnFeatureStart).toBe(false);
    expect(DEFAULT_DISCORD_SETTINGS.notifyOnFeatureComplete).toBe(true);
    expect(DEFAULT_DISCORD_SETTINGS.notifyOnMilestoneComplete).toBe(true);
    expect(DEFAULT_DISCORD_SETTINGS.notifyOnProjectComplete).toBe(true);
    expect(DEFAULT_DISCORD_SETTINGS.notifyOnError).toBe(true);
  });

  test('DiscordSettings type allows all expected fields', () => {
    // Create a valid Discord settings object
    const discordSettings: DiscordSettings = {
      enabled: true,
      tokenConfigured: true,
      guildId: '123456789',
      notificationChannelId: '987654321',
      notificationChannelName: 'automaker-notifications',
      autoNotify: true,
      notifyOnFeatureStart: true,
      notifyOnFeatureComplete: true,
      notifyOnMilestoneComplete: true,
      notifyOnProjectComplete: true,
      notifyOnError: true,
    };

    // Verify all fields are accessible
    expect(discordSettings.enabled).toBe(true);
    expect(discordSettings.guildId).toBe('123456789');
    expect(discordSettings.notificationChannelId).toBe('987654321');
    expect(discordSettings.notificationChannelName).toBe('automaker-notifications');
  });

  test('GlobalSettings can contain Discord settings', () => {
    // Create a mock global settings with Discord config
    const globalSettings: Partial<GlobalSettings> = {
      discord: {
        enabled: true,
        tokenConfigured: true,
        guildId: '123456789',
        notificationChannelId: '987654321',
        autoNotify: true,
        notifyOnFeatureComplete: true,
        notifyOnMilestoneComplete: true,
        notifyOnProjectComplete: true,
        notifyOnError: true,
      },
    };

    expect(globalSettings.discord).toBeDefined();
    expect(globalSettings.discord?.enabled).toBe(true);
    expect(globalSettings.discord?.guildId).toBe('123456789');
  });

  test('ProjectSettings can contain Discord settings override', () => {
    // Create a mock project settings with Discord override
    const projectSettings: Partial<ProjectSettings> = {
      discord: {
        enabled: true,
        tokenConfigured: true,
        guildId: '123456789',
        notificationChannelId: '111111111',
        notificationChannelName: 'project-specific-channel',
        autoNotify: false,
        notifyOnFeatureComplete: false,
        notifyOnMilestoneComplete: true,
        notifyOnProjectComplete: true,
        notifyOnError: true,
      },
    };

    expect(projectSettings.discord).toBeDefined();
    expect(projectSettings.discord?.notificationChannelId).toBe('111111111');
    expect(projectSettings.discord?.notificationChannelName).toBe('project-specific-channel');
  });

  test('Credentials can contain Discord bot token', () => {
    // Create mock credentials with Discord token
    const credentials: Partial<Credentials> = {
      apiKeys: {
        anthropic: 'test-key',
        google: '',
        openai: '',
      },
      discordTokens: {
        botToken: 'test-discord-bot-token',
      },
    };

    expect(credentials.discordTokens).toBeDefined();
    expect(credentials.discordTokens?.botToken).toBe('test-discord-bot-token');
  });

  test('Discord settings are optional in all contexts', () => {
    // Verify that Discord settings are optional
    const globalSettings: Partial<GlobalSettings> = {
      version: 6,
      // discord field is optional
    };

    const projectSettings: Partial<ProjectSettings> = {
      version: 1,
      // discord field is optional
    };

    const credentials: Partial<Credentials> = {
      version: 1,
      apiKeys: {
        anthropic: '',
        google: '',
        openai: '',
      },
      // discordTokens field is optional
    };

    expect(globalSettings.discord).toBeUndefined();
    expect(projectSettings.discord).toBeUndefined();
    expect(credentials.discordTokens).toBeUndefined();
  });

  test('Discord settings notification flags work independently', () => {
    // Verify that notification flags can be set independently
    const settings: DiscordSettings = {
      enabled: true,
      tokenConfigured: true,
      notifyOnFeatureStart: true,
      notifyOnFeatureComplete: false,
      notifyOnMilestoneComplete: true,
      notifyOnProjectComplete: false,
      notifyOnError: true,
    };

    expect(settings.notifyOnFeatureStart).toBe(true);
    expect(settings.notifyOnFeatureComplete).toBe(false);
    expect(settings.notifyOnMilestoneComplete).toBe(true);
    expect(settings.notifyOnProjectComplete).toBe(false);
    expect(settings.notifyOnError).toBe(true);
  });
});
