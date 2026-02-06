/**
 * Linear Client Service Tests
 *
 * Tests for the native Linear API client service that replaces
 * third-party npx mcp-linear package.
 *
 * Note: Full integration testing requires a real Linear API key.
 * These tests focus on the service structure and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LinearClientService,
  getLinearClientService,
  resetLinearClientService,
} from '@/services/linear-client.js';
import { SettingsService } from '@/services/settings-service.js';

describe('linear-client.ts', () => {
  let mockSettingsService: SettingsService;

  beforeEach(() => {
    // Reset singleton between tests
    resetLinearClientService();

    // Mock settings service with no Linear API key
    mockSettingsService = {
      getCredentials: vi.fn().mockResolvedValue({
        version: 1,
        apiKeys: {
          anthropic: '',
          google: '',
          openai: '',
          linear: undefined,
        },
      }),
      updateCredentials: vi.fn().mockResolvedValue(undefined),
    } as unknown as SettingsService;
  });

  describe('initialization without API key', () => {
    it('should return false when no API key is configured', async () => {
      const linearClient = getLinearClientService(mockSettingsService);
      const result = await linearClient.initialize();
      expect(result).toBe(false);
      expect(linearClient.isConnected()).toBe(false);
    });

    it('should set health check error when no API key', async () => {
      const linearClient = getLinearClientService(mockSettingsService);
      await linearClient.initialize();
      const health = linearClient.getLastHealthCheck();
      expect(health).not.toBeNull();
      expect(health?.connected).toBe(false);
      expect(health?.error).toContain('not configured');
    });
  });

  describe('health check without initialization', () => {
    it('should return not connected when not initialized', async () => {
      const linearClient = getLinearClientService(mockSettingsService);
      const health = await linearClient.checkHealth();
      expect(health.connected).toBe(false);
      expect(health.error).toBe('Linear client not initialized');
    });
  });

  describe('operations without initialization', () => {
    it('should throw when calling getViewer without initialization', async () => {
      const linearClient = getLinearClientService(mockSettingsService);
      await expect(linearClient.getViewer()).rejects.toThrow('Linear client not initialized');
    });

    it('should throw when calling getTeams without initialization', async () => {
      const linearClient = getLinearClientService(mockSettingsService);
      await expect(linearClient.getTeams()).rejects.toThrow('Linear client not initialized');
    });

    it('should throw when calling createIssue without initialization', async () => {
      const linearClient = getLinearClientService(mockSettingsService);
      await expect(
        linearClient.createIssue({
          title: 'Test',
          teamId: 'team-123',
        })
      ).rejects.toThrow('Linear client not initialized');
    });

    it('should throw when calling searchIssues without initialization', async () => {
      const linearClient = getLinearClientService(mockSettingsService);
      await expect(linearClient.searchIssues({})).rejects.toThrow('Linear client not initialized');
    });

    it('should throw when calling addComment without initialization', async () => {
      const linearClient = getLinearClientService(mockSettingsService);
      await expect(linearClient.addComment('issue-123', 'comment')).rejects.toThrow(
        'Linear client not initialized'
      );
    });
  });

  describe('singleton behavior', () => {
    it('should return the same instance for multiple calls', () => {
      const instance1 = getLinearClientService(mockSettingsService);
      const instance2 = getLinearClientService(mockSettingsService);
      expect(instance1).toBe(instance2);
    });

    it('should reset singleton when resetLinearClientService is called', () => {
      const instance1 = getLinearClientService(mockSettingsService);
      resetLinearClientService();
      const instance2 = getLinearClientService(mockSettingsService);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('LinearClientService class', () => {
    it('should construct correctly', () => {
      const service = new LinearClientService(mockSettingsService);
      expect(service).toBeInstanceOf(LinearClientService);
      expect(service.isConnected()).toBe(false);
    });

    it('should report not connected initially', () => {
      const service = new LinearClientService(mockSettingsService);
      expect(service.isConnected()).toBe(false);
    });

    it('should have null last health check initially', () => {
      const service = new LinearClientService(mockSettingsService);
      expect(service.getLastHealthCheck()).toBeNull();
    });
  });
});
