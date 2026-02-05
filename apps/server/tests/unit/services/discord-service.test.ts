/**
 * Discord Service Tests
 *
 * Unit tests for the Discord service layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DiscordService,
  getDiscordService,
  _resetDiscordServiceForTesting,
} from '../../../src/services/discord-service.js';
import type { ClaudeProvider } from '../../../src/providers/claude-provider.js';

// Mock ClaudeProvider
const mockProvider = {
  getName: () => 'claude',
  executeQuery: vi.fn(),
  detectInstallation: vi.fn(),
  getAvailableModels: vi.fn(),
  validateConfig: vi.fn(),
  supportsFeature: vi.fn(),
  getConfig: vi.fn(),
  setConfig: vi.fn(),
} as unknown as ClaudeProvider;

describe('DiscordService', () => {
  let discordService: DiscordService;

  beforeEach(() => {
    _resetDiscordServiceForTesting();
    discordService = new DiscordService(mockProvider);
    vi.clearAllMocks();
  });

  describe('Not Yet Implemented Behavior', () => {
    it('should return error for getServerInfo (not yet implemented)', async () => {
      const result = await discordService.getServerInfo();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorType).toBe('unknown'); // Generic error since MCP not yet wired
    });

    it('should return error for listChannels (not yet implemented)', async () => {
      const result = await discordService.listChannels();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for findChannel (not yet implemented)', async () => {
      const result = await discordService.findChannel('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Channel Management', () => {
    it('should have listChannels method', () => {
      expect(typeof discordService.listChannels).toBe('function');
    });

    it('should have findChannel method', () => {
      expect(typeof discordService.findChannel).toBe('function');
    });

    it('should have createTextChannel method', () => {
      expect(typeof discordService.createTextChannel).toBe('function');
    });

    it('should have deleteChannel method', () => {
      expect(typeof discordService.deleteChannel).toBe('function');
    });

    it('should return error when createTextChannel is called', async () => {
      const result = await discordService.createTextChannel({ name: 'test-channel' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });

  describe('Category Management', () => {
    it('should have createCategory method', () => {
      expect(typeof discordService.createCategory).toBe('function');
    });

    it('should have findCategory method', () => {
      expect(typeof discordService.findCategory).toBe('function');
    });

    it('should have deleteCategory method', () => {
      expect(typeof discordService.deleteCategory).toBe('function');
    });

    it('should have listChannelsInCategory method', () => {
      expect(typeof discordService.listChannelsInCategory).toBe('function');
    });

    it('should return error when createCategory is called', async () => {
      const result = await discordService.createCategory({ name: 'test-category' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });

  describe('Message Operations', () => {
    it('should have sendMessage method', () => {
      expect(typeof discordService.sendMessage).toBe('function');
    });

    it('should have readMessages method', () => {
      expect(typeof discordService.readMessages).toBe('function');
    });

    it('should have editMessage method', () => {
      expect(typeof discordService.editMessage).toBe('function');
    });

    it('should have deleteMessage method', () => {
      expect(typeof discordService.deleteMessage).toBe('function');
    });

    it('should return error when sendMessage is called', async () => {
      const result = await discordService.sendMessage({
        channelId: '123',
        message: 'test message',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });

  describe('Webhook Operations', () => {
    it('should have createWebhook method', () => {
      expect(typeof discordService.createWebhook).toBe('function');
    });

    it('should have listWebhooks method', () => {
      expect(typeof discordService.listWebhooks).toBe('function');
    });

    it('should have sendWebhookMessage method', () => {
      expect(typeof discordService.sendWebhookMessage).toBe('function');
    });

    it('should have deleteWebhook method', () => {
      expect(typeof discordService.deleteWebhook).toBe('function');
    });

    it('should return error when createWebhook is called', async () => {
      const result = await discordService.createWebhook({
        channelId: '123',
        name: 'test-webhook',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });

  describe('Reaction Operations', () => {
    it('should have addReaction method', () => {
      expect(typeof discordService.addReaction).toBe('function');
    });

    it('should have removeReaction method', () => {
      expect(typeof discordService.removeReaction).toBe('function');
    });

    it('should return error when addReaction is called', async () => {
      const result = await discordService.addReaction('123', '456', '👍');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });

  describe('Private Message Operations', () => {
    it('should have sendPrivateMessage method', () => {
      expect(typeof discordService.sendPrivateMessage).toBe('function');
    });

    it('should have readPrivateMessages method', () => {
      expect(typeof discordService.readPrivateMessages).toBe('function');
    });

    it('should return error when sendPrivateMessage is called', async () => {
      const result = await discordService.sendPrivateMessage('123', 'test message');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });

  describe('User Operations', () => {
    it('should have getUserByName method', () => {
      expect(typeof discordService.getUserByName).toBe('function');
    });

    it('should return error when getUserByName is called', async () => {
      const result = await discordService.getUserByName('testuser');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getDiscordService', () => {
      const service1 = getDiscordService(mockProvider);
      const service2 = getDiscordService(mockProvider);
      expect(service1).toBe(service2);
    });
  });

  describe('Error Classification', () => {
    it('should return DiscordOperationResult with proper structure', async () => {
      const result = await discordService.getServerInfo();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('errorType');
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(['connection', 'permission', 'not_found', 'rate_limit', 'unknown']).toContain(
        result.errorType
      );
    });
  });
});
