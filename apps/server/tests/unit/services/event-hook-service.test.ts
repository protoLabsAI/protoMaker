/**
 * Tests for Event Hook Service
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventHookService } from '../../../src/services/event-hook-service.js';
import { createEventEmitter } from '../../../src/lib/events.js';
import type { EventEmitter } from '../../../src/lib/events.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type {
  EventHookTrigger,
  EventHook,
  EventHookDiscordAction,
  GlobalSettings,
} from '@automaker/types';

// Mock fetch globally
global.fetch = vi.fn();

describe('EventHookService', () => {
  let service: EventHookService;
  let emitter: EventEmitter;
  let mockSettingsService: SettingsService;

  beforeEach(() => {
    service = new EventHookService();
    emitter = createEventEmitter();

    // Mock settings service
    mockSettingsService = {
      getGlobalSettings: vi.fn(),
    } as unknown as SettingsService;

    // Reset fetch mock
    vi.mocked(global.fetch).mockReset();
  });

  afterEach(() => {
    service.destroy();
  });

  describe('Discord Hook Execution', () => {
    it('should execute Discord webhook hook successfully', async () => {
      const webhookUrl = 'https://discord.com/api/webhooks/123/token';
      const testHook: EventHook = {
        id: 'test-discord-hook',
        name: 'Test Discord Hook',
        enabled: true,
        trigger: 'feature_success',
        action: {
          type: 'discord',
          channelId: webhookUrl,
          message: 'Feature {{featureName}} completed successfully!',
        } as EventHookDiscordAction,
      };

      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        eventHooks: [testHook],
      } as GlobalSettings);

      // Mock successful webhook response
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      service.initialize(emitter, mockSettingsService);

      // Trigger feature success event
      emitter.emit('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'test-123',
        featureName: 'Test Feature',
        passes: true,
        projectPath: '/test/project',
      });

      // Wait for async hooks to execute
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify webhook was called
      expect(global.fetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Test Feature'),
        })
      );
    });

    it('should substitute context variables in Discord message', async () => {
      const webhookUrl = 'https://discord.com/api/webhooks/123/token';
      const testHook: EventHook = {
        id: 'test-discord-hook',
        name: 'Test Discord Hook',
        enabled: true,
        trigger: 'feature_created',
        action: {
          type: 'discord',
          channelId: webhookUrl,
          message:
            'New feature: {{featureName}} in {{projectName}} ({{featureId}})',
        } as EventHookDiscordAction,
      };

      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        eventHooks: [testHook],
      } as GlobalSettings);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      service.initialize(emitter, mockSettingsService);

      // Trigger feature created event
      emitter.emit('feature:created', {
        featureId: 'feat-456',
        featureName: 'My Feature',
        projectPath: '/test/my-project',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify message substitution
      expect(global.fetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          body: expect.stringContaining('My Feature'),
        })
      );

      const callBody = JSON.parse(
        vi.mocked(global.fetch).mock.calls[0][1]?.body as string
      );
      expect(callBody.content).toContain('My Feature');
      expect(callBody.content).toContain('my-project');
      expect(callBody.content).toContain('feat-456');
    });

    it('should format Discord messages with event emoji', async () => {
      const webhookUrl = 'https://discord.com/api/webhooks/123/token';
      const testHook: EventHook = {
        id: 'test-discord-hook',
        name: 'Test Discord Hook',
        enabled: true,
        trigger: 'feature_error',
        action: {
          type: 'discord',
          channelId: webhookUrl,
          message: 'Build failed',
        } as EventHookDiscordAction,
      };

      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        eventHooks: [testHook],
      } as GlobalSettings);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      service.initialize(emitter, mockSettingsService);

      emitter.emit('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'test-123',
        passes: false,
        error: 'Build error',
        projectPath: '/test/project',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const callBody = JSON.parse(
        vi.mocked(global.fetch).mock.calls[0][1]?.body as string
      );
      // Should include error emoji
      expect(callBody.content).toContain('❌');
    });

    it('should handle Discord webhook failure gracefully', async () => {
      const webhookUrl = 'https://discord.com/api/webhooks/123/token';
      const testHook: EventHook = {
        id: 'test-discord-hook',
        name: 'Test Discord Hook',
        enabled: true,
        trigger: 'feature_success',
        action: {
          type: 'discord',
          channelId: webhookUrl,
          message: 'Test message',
        } as EventHookDiscordAction,
      };

      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        eventHooks: [testHook],
      } as GlobalSettings);

      // Mock failed webhook response
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 400,
      } as Response);

      service.initialize(emitter, mockSettingsService);

      emitter.emit('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'test-123',
        passes: true,
        projectPath: '/test/project',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Hook should fail but not crash the service
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should log warning for non-webhook Discord channel IDs', async () => {
      const channelId = '1234567890';
      const testHook: EventHook = {
        id: 'test-discord-hook',
        name: 'Test Discord Hook',
        enabled: true,
        trigger: 'feature_success',
        action: {
          type: 'discord',
          channelId,
          message: 'Test message',
        } as EventHookDiscordAction,
      };

      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        eventHooks: [testHook],
      } as GlobalSettings);

      service.initialize(emitter, mockSettingsService);

      emitter.emit('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'test-123',
        passes: true,
        projectPath: '/test/project',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not call webhook for channel ID
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Hook Type Handling', () => {
    it('should handle multiple hook types for same trigger', async () => {
      const hooks: EventHook[] = [
        {
          id: 'shell-hook',
          name: 'Shell Hook',
          enabled: true,
          trigger: 'feature_success',
          action: {
            type: 'shell',
            command: 'echo "success"',
          },
        },
        {
          id: 'discord-hook',
          name: 'Discord Hook',
          enabled: true,
          trigger: 'feature_success',
          action: {
            type: 'discord',
            channelId: 'https://discord.com/api/webhooks/123/token',
            message: 'Success!',
          } as EventHookDiscordAction,
        },
      ];

      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        eventHooks: hooks,
      } as GlobalSettings);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      service.initialize(emitter, mockSettingsService);

      emitter.emit('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'test-123',
        passes: true,
        projectPath: '/test/project',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Discord webhook should be called
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
