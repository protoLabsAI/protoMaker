/**
 * Unit tests for BeadsService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BeadsService } from '../../../src/services/beads-service.js';
import * as platform from '@protolabs-ai/platform';

// Mock the platform module
vi.mock('@protolabs-ai/platform', () => ({
  spawnProcess: vi.fn(),
}));

describe('BeadsService', () => {
  let beadsService: BeadsService;
  const mockProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    beadsService = new BeadsService('bd');
  });

  describe('checkCliAvailable', () => {
    it('should return true when CLI is available', async () => {
      vi.mocked(platform.spawnProcess).mockResolvedValue({
        stdout: '/usr/local/bin/bd',
        stderr: '',
        exitCode: 0,
      });

      const result = await beadsService.checkCliAvailable();
      expect(result).toBe(true);
    });

    it('should return false when CLI is not available', async () => {
      vi.mocked(platform.spawnProcess).mockResolvedValue({
        stdout: '',
        stderr: 'command not found',
        exitCode: 1,
      });

      const result = await beadsService.checkCliAvailable();
      expect(result).toBe(false);
    });
  });

  describe('listTasks', () => {
    it('should list open tasks by default', async () => {
      const mockTasks = [
        {
          id: 'test-123',
          title: 'Test Task',
          status: 'open' as const,
          priority: 2,
          issue_type: 'task' as const,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          dependency_count: 0,
          dependent_count: 0,
          comment_count: 0,
        },
      ];

      vi.mocked(platform.spawnProcess).mockResolvedValue({
        stdout: JSON.stringify(mockTasks),
        stderr: '',
        exitCode: 0,
      });

      const result = await beadsService.listTasks(mockProjectPath);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTasks);
    });

    it('should handle errors', async () => {
      vi.mocked(platform.spawnProcess).mockResolvedValue({
        stdout: '',
        stderr: 'Error message',
        exitCode: 1,
      });

      const result = await beadsService.listTasks(mockProjectPath);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Error message');
    });
  });

  describe('getTask', () => {
    it('should get a specific task', async () => {
      const mockTask = {
        id: 'test-123',
        title: 'Test Task',
        status: 'open' as const,
        priority: 2,
        issue_type: 'task' as const,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        dependency_count: 0,
        dependent_count: 0,
        comment_count: 0,
      };

      vi.mocked(platform.spawnProcess).mockResolvedValue({
        stdout: JSON.stringify([mockTask]),
        stderr: '',
        exitCode: 0,
      });

      const result = await beadsService.getTask(mockProjectPath, 'test-123');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
    });

    it('should return error when task not found', async () => {
      vi.mocked(platform.spawnProcess).mockResolvedValue({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });

      const result = await beadsService.getTask(mockProjectPath, 'non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });
  });

  describe('createTask', () => {
    it('should create a task', async () => {
      const mockTask = {
        id: 'test-456',
        title: 'New Task',
        status: 'open' as const,
        priority: 2,
        issue_type: 'task' as const,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        dependency_count: 0,
        dependent_count: 0,
        comment_count: 0,
      };

      // Mock create command
      vi.mocked(platform.spawnProcess)
        .mockResolvedValueOnce({
          stdout: JSON.stringify([mockTask]),
          stderr: '',
          exitCode: 0,
        })
        // Mock sync command
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

      const result = await beadsService.createTask(mockProjectPath, {
        title: 'New Task',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
    });
  });

  describe('closeTask', () => {
    it('should close a task', async () => {
      // Mock close command
      vi.mocked(platform.spawnProcess)
        .mockResolvedValueOnce({
          stdout: '{}',
          stderr: '',
          exitCode: 0,
        })
        // Mock sync command
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

      const result = await beadsService.closeTask(mockProjectPath, 'test-123');
      expect(result.success).toBe(true);
    });
  });

  describe('addDependency', () => {
    it('should add a dependency', async () => {
      // Mock add-dependency command
      vi.mocked(platform.spawnProcess)
        .mockResolvedValueOnce({
          stdout: '{}',
          stderr: '',
          exitCode: 0,
        })
        // Mock sync command
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

      const result = await beadsService.addDependency(mockProjectPath, 'task-1', 'task-2');
      expect(result.success).toBe(true);
    });
  });
});
