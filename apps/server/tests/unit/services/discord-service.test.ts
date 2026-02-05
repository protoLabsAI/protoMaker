import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DiscordService,
  type DiscordGuildInfo,
  type DiscordChannel,
} from '@/services/discord-service.js';

describe('discord-service.ts', () => {
  let service: DiscordService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new DiscordService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isAvailable', () => {
    it('should return true by default (placeholder)', async () => {
      const available = await service.isAvailable();
      expect(available).toBe(true);
    });

    it('should cache availability check for 1 minute', async () => {
      const firstCheck = await service.isAvailable();
      expect(firstCheck).toBe(true);

      // Advance time by 30 seconds (within cache window)
      vi.advanceTimersByTime(30000);
      const secondCheck = await service.isAvailable();
      expect(secondCheck).toBe(true);

      // Advance time by another 31 seconds (exceed cache window)
      vi.advanceTimersByTime(31000);
      const thirdCheck = await service.isAvailable();
      expect(thirdCheck).toBe(true);
    });
  });

  describe('getGuildInfo', () => {
    it('should return error when no cached data exists', async () => {
      const result = await service.getGuildInfo();
      expect(result.success).toBe(false);
      expect(result.error).toContain('not in cache');
    });

    it('should return cached data if valid', async () => {
      const guildInfo: DiscordGuildInfo = {
        id: '123456',
        name: 'Test Guild',
        memberCount: 100,
        channelCount: 10,
      };

      // Update cache
      service.updateGuildInfoCache(guildInfo);

      // Should return cached data
      const result = await service.getGuildInfo();
      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(result.data).toEqual(guildInfo);
    });

    it('should invalidate cache after 5 minutes', async () => {
      const guildInfo: DiscordGuildInfo = {
        id: '123456',
        name: 'Test Guild',
        memberCount: 100,
      };

      service.updateGuildInfoCache(guildInfo);

      // Initially should return cached data
      let result = await service.getGuildInfo();
      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);

      // Advance time by 5 minutes + 1 second
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Should now indicate cache is stale
      result = await service.getGuildInfo();
      expect(result.success).toBe(false);
      expect(result.error).toContain('not in cache');
    });
  });

  describe('updateGuildInfoCache', () => {
    it('should update cache with new guild info', () => {
      const guildInfo: DiscordGuildInfo = {
        id: '123456',
        name: 'Test Guild',
        memberCount: 50,
      };

      service.updateGuildInfoCache(guildInfo);

      const stats = service.getCacheStats();
      expect(stats.guildInfoCached).toBe(true);
      expect(stats.guildInfoAge).toBeLessThan(100);
    });
  });

  describe('listChannels', () => {
    it('should return error when no cached data exists', async () => {
      const result = await service.listChannels();
      expect(result.success).toBe(false);
      expect(result.error).toContain('not in cache');
    });

    it('should return cached channels if valid', async () => {
      const channels: DiscordChannel[] = [
        { id: '1', name: 'general', type: 'GUILD_TEXT' },
        { id: '2', name: 'announcements', type: 'GUILD_TEXT' },
        { id: '3', name: 'voice-chat', type: 'GUILD_VOICE' },
      ];

      service.updateChannelsCache(channels);

      const result = await service.listChannels();
      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(result.data).toEqual(channels);
      expect(result.data?.length).toBe(3);
    });

    it('should invalidate cache after 5 minutes', async () => {
      const channels: DiscordChannel[] = [
        { id: '1', name: 'general', type: 'GUILD_TEXT' },
      ];

      service.updateChannelsCache(channels);

      // Initially should return cached data
      let result = await service.listChannels();
      expect(result.success).toBe(true);

      // Advance time by 5 minutes + 1 second
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Should now indicate cache is stale
      result = await service.listChannels();
      expect(result.success).toBe(false);
      expect(result.error).toContain('not in cache');
    });
  });

  describe('updateChannelsCache', () => {
    it('should update cache with new channels list', () => {
      const channels: DiscordChannel[] = [
        { id: '1', name: 'general', type: 'GUILD_TEXT' },
        { id: '2', name: 'dev', type: 'GUILD_TEXT', categoryId: 'cat1' },
      ];

      service.updateChannelsCache(channels);

      const stats = service.getCacheStats();
      expect(stats.channelsCached).toBe(true);
      expect(stats.channelsCount).toBe(2);
      expect(stats.channelsAge).toBeLessThan(100);
    });
  });

  describe('findChannel', () => {
    beforeEach(() => {
      const channels: DiscordChannel[] = [
        { id: '111', name: 'general', type: 'GUILD_TEXT' },
        { id: '222', name: 'announcements', type: 'GUILD_TEXT' },
        { id: '333', name: 'voice-chat', type: 'GUILD_VOICE' },
      ];
      service.updateChannelsCache(channels);
    });

    it('should find channel by ID', async () => {
      const result = await service.findChannel('111');
      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(result.data?.id).toBe('111');
      expect(result.data?.name).toBe('general');
    });

    it('should find channel by name', async () => {
      const result = await service.findChannel('announcements');
      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(result.data?.id).toBe('222');
      expect(result.data?.name).toBe('announcements');
    });

    it('should find channel by name with # prefix', async () => {
      const result = await service.findChannel('#general');
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('111');
    });

    it('should be case-insensitive when searching by name', async () => {
      const result = await service.findChannel('GENERAL');
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('111');
    });

    it('should return error when channel not found', async () => {
      const result = await service.findChannel('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when cache is empty', async () => {
      service.clearCache();
      const result = await service.findChannel('general');
      expect(result.success).toBe(false);
      expect(result.error).toContain('cache is empty');
    });

    it('should return error when cache is stale', async () => {
      // Advance time to invalidate cache
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      const result = await service.findChannel('general');
      expect(result.success).toBe(false);
      expect(result.error).toContain('stale');
    });
  });

  describe('clearCache', () => {
    it('should clear all cached data', async () => {
      const guildInfo: DiscordGuildInfo = {
        id: '123',
        name: 'Test',
      };
      const channels: DiscordChannel[] = [
        { id: '1', name: 'general', type: 'GUILD_TEXT' },
      ];

      service.updateGuildInfoCache(guildInfo);
      service.updateChannelsCache(channels);

      // Verify caches are populated
      let stats = service.getCacheStats();
      expect(stats.guildInfoCached).toBe(true);
      expect(stats.channelsCached).toBe(true);

      // Clear cache
      service.clearCache();

      // Verify caches are cleared
      stats = service.getCacheStats();
      expect(stats.guildInfoCached).toBe(false);
      expect(stats.channelsCached).toBe(false);
    });
  });

  describe('getCacheStats', () => {
    it('should return empty stats when no cache exists', () => {
      const stats = service.getCacheStats();
      expect(stats.guildInfoCached).toBe(false);
      expect(stats.guildInfoAge).toBeUndefined();
      expect(stats.channelsCached).toBe(false);
      expect(stats.channelsAge).toBeUndefined();
      expect(stats.channelsCount).toBeUndefined();
    });

    it('should return accurate cache stats', () => {
      const guildInfo: DiscordGuildInfo = {
        id: '123',
        name: 'Test',
      };
      const channels: DiscordChannel[] = [
        { id: '1', name: 'general', type: 'GUILD_TEXT' },
        { id: '2', name: 'dev', type: 'GUILD_TEXT' },
      ];

      service.updateGuildInfoCache(guildInfo);
      service.updateChannelsCache(channels);

      // Advance time slightly
      vi.advanceTimersByTime(1000);

      const stats = service.getCacheStats();
      expect(stats.guildInfoCached).toBe(true);
      expect(stats.guildInfoAge).toBeGreaterThanOrEqual(1000);
      expect(stats.channelsCached).toBe(true);
      expect(stats.channelsAge).toBeGreaterThanOrEqual(1000);
      expect(stats.channelsCount).toBe(2);
    });

    it('should indicate when cache is stale', () => {
      const channels: DiscordChannel[] = [
        { id: '1', name: 'general', type: 'GUILD_TEXT' },
      ];

      service.updateChannelsCache(channels);

      // Advance time beyond TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      const stats = service.getCacheStats();
      expect(stats.channelsCached).toBe(false);
      expect(stats.channelsAge).toBeGreaterThan(5 * 60 * 1000);
    });
  });

  describe('graceful fallback', () => {
    it('should provide helpful error messages when MCP not available', async () => {
      // Mock isAvailable to return false
      vi.spyOn(service, 'isAvailable').mockResolvedValue(false);

      const guildResult = await service.getGuildInfo();
      expect(guildResult.success).toBe(false);
      expect(guildResult.error).toContain('Discord MCP is not available');

      const channelsResult = await service.listChannels();
      expect(channelsResult.success).toBe(false);
      expect(channelsResult.error).toContain('Discord MCP is not available');

      const findResult = await service.findChannel('general');
      expect(findResult.success).toBe(false);
      expect(findResult.error).toContain('Discord MCP is not available');
    });
  });

  describe('channel types', () => {
    it('should handle different channel types', () => {
      const channels: DiscordChannel[] = [
        { id: '1', name: 'text-channel', type: 'GUILD_TEXT' },
        { id: '2', name: 'voice-channel', type: 'GUILD_VOICE' },
        { id: '3', name: 'category', type: 'GUILD_CATEGORY' },
        { id: '4', name: 'unknown', type: 'UNKNOWN' },
      ];

      service.updateChannelsCache(channels);

      const stats = service.getCacheStats();
      expect(stats.channelsCount).toBe(4);
    });

    it('should handle channels with category information', () => {
      const channels: DiscordChannel[] = [
        {
          id: '1',
          name: 'general',
          type: 'GUILD_TEXT',
          categoryId: 'cat1',
          categoryName: 'General',
          position: 0,
        },
        {
          id: '2',
          name: 'dev',
          type: 'GUILD_TEXT',
          categoryId: 'cat2',
          categoryName: 'Development',
          position: 1,
        },
      ];

      service.updateChannelsCache(channels);

      const stats = service.getCacheStats();
      expect(stats.channelsCount).toBe(2);
    });
  });
});
