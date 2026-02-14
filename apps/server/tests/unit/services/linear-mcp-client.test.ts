import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearMCPClient, LinearAPIError } from '@/services/linear-mcp-client.js';
import type { SettingsService } from '@/services/settings-service.js';
import type { ProjectSettings } from '@/types/settings.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('linear-mcp-client.ts', () => {
  let mockSettingsService: SettingsService;
  let client: LinearMCPClient;
  const mockProjectPath = '/test/project';
  const mockAccessToken = 'test-token-123';

  beforeEach(() => {
    // Reset mocks
    mockFetch.mockReset();

    // Create mock settings service
    mockSettingsService = {
      getProjectSettings: vi.fn().mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            agentToken: mockAccessToken,
          },
        },
      } as ProjectSettings),
    } as unknown as SettingsService;

    client = new LinearMCPClient(mockSettingsService, mockProjectPath);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a client instance', () => {
      expect(client).toBeInstanceOf(LinearMCPClient);
    });
  });

  describe('createIssue', () => {
    it('should successfully create an issue', async () => {
      const mockResponse = {
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: 'issue-123',
              identifier: 'ENG-123',
              url: 'https://linear.app/team/issue/ENG-123',
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const result = await client.createIssue({
        title: 'Test Issue',
        description: 'Test description',
        teamId: 'team-123',
      });

      expect(result).toEqual({
        issueId: 'issue-123',
        identifier: 'ENG-123',
        url: 'https://linear.app/team/issue/ENG-123',
      });

      // Verify fetch was called correctly
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockAccessToken}`,
          },
        })
      );
    });

    it('should include optional fields in create request', async () => {
      const mockResponse = {
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: 'issue-123',
              identifier: 'ENG-123',
              url: 'https://linear.app/team/issue/ENG-123',
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await client.createIssue({
        title: 'Test Issue',
        description: 'Test description',
        teamId: 'team-123',
        projectId: 'project-456',
        priority: 2,
        labelIds: ['label-1', 'label-2'],
        assigneeId: 'user-789',
      });

      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body as string);
      expect(requestBody.variables).toMatchObject({
        title: 'Test Issue',
        description: 'Test description',
        teamId: 'team-123',
        projectId: 'project-456',
        priority: 2,
        labelIds: ['label-1', 'label-2'],
        assigneeId: 'user-789',
      });
    });

    it('should throw error when issue creation fails', async () => {
      const mockResponse = {
        data: {
          issueCreate: {
            success: false,
            issue: null,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      await expect(
        client.createIssue({
          title: 'Test Issue',
          teamId: 'team-123',
        })
      ).rejects.toThrow('Failed to create Linear issue');
    });
  });

  describe('updateIssue', () => {
    it('should successfully update an issue', async () => {
      const mockResponse = {
        data: {
          issueUpdate: {
            success: true,
            issue: {
              id: 'issue-123',
              identifier: 'ENG-123',
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.updateIssue({
        issueId: 'issue-123',
        title: 'Updated Title',
        stateId: 'state-456',
        priority: 1,
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error when update fails', async () => {
      const mockResponse = {
        data: {
          issueUpdate: {
            success: false,
            issue: null,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      await expect(
        client.updateIssue({
          issueId: 'issue-123',
          title: 'Updated Title',
        })
      ).rejects.toThrow(LinearAPIError);
    });
  });

  describe('addComment', () => {
    it('should successfully add a comment', async () => {
      const mockResponse = {
        data: {
          commentCreate: {
            success: true,
            comment: {
              id: 'comment-123',
              body: 'Test comment',
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.addComment({
        issueId: 'issue-123',
        body: 'Test comment',
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body as string);
      expect(requestBody.variables).toEqual({
        issueId: 'issue-123',
        body: 'Test comment',
      });
    });

    it('should throw error when comment creation fails', async () => {
      const mockResponse = {
        data: {
          commentCreate: {
            success: false,
            comment: null,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      await expect(
        client.addComment({
          issueId: 'issue-123',
          body: 'Test comment',
        })
      ).rejects.toThrow(LinearAPIError);
    });
  });

  describe('error handling', () => {
    it('should throw LinearAPIError with isTokenExpired=true for 401 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
      });

      try {
        await client.createIssue({
          title: 'Test Issue',
          teamId: 'team-123',
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(LinearAPIError);
        expect((error as LinearAPIError).statusCode).toBe(401);
        expect((error as LinearAPIError).isTokenExpired).toBe(true);
      }
    });

    it('should throw LinearAPIError with isTokenExpired=true for 403 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers(),
      });

      try {
        await client.createIssue({
          title: 'Test Issue',
          teamId: 'team-123',
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(LinearAPIError);
        expect((error as LinearAPIError).statusCode).toBe(403);
        expect((error as LinearAPIError).isTokenExpired).toBe(true);
      }
    });

    it('should throw LinearAPIError with isRateLimited=true for 429 status', async () => {
      const headers = new Headers();
      headers.set('retry-after', '60');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers,
      });

      try {
        await client.createIssue({
          title: 'Test Issue',
          teamId: 'team-123',
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(LinearAPIError);
        expect((error as LinearAPIError).statusCode).toBe(429);
        expect((error as LinearAPIError).isRateLimited).toBe(true);
        expect((error as LinearAPIError).message).toContain('rate limit');
        expect((error as LinearAPIError).message).toContain('60');
      }
    });

    it('should handle GraphQL errors with authentication indication', async () => {
      const mockResponse = {
        errors: [
          {
            message: 'Unauthorized access',
            extensions: { code: 'UNAUTHENTICATED' },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      try {
        await client.createIssue({
          title: 'Test Issue',
          teamId: 'team-123',
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(LinearAPIError);
        expect((error as LinearAPIError).isTokenExpired).toBe(true);
        expect((error as LinearAPIError).message).toContain('Unauthorized access');
      }
    });

    it('should handle GraphQL errors without authentication indication', async () => {
      const mockResponse = {
        errors: [
          {
            message: 'Team not found',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      try {
        await client.createIssue({
          title: 'Test Issue',
          teamId: 'invalid-team',
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(LinearAPIError);
        expect((error as LinearAPIError).isTokenExpired).toBe(false);
        expect((error as LinearAPIError).message).toContain('Team not found');
      }
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await client.createIssue({
          title: 'Test Issue',
          teamId: 'team-123',
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(LinearAPIError);
        expect((error as LinearAPIError).message).toContain('Network error');
      }
    });

    it('should handle missing token in settings when no env fallback', async () => {
      // Clear env vars so fallback doesn't trigger
      const savedKey = process.env.LINEAR_API_KEY;
      const savedToken = process.env.LINEAR_API_TOKEN;
      delete process.env.LINEAR_API_KEY;
      delete process.env.LINEAR_API_TOKEN;

      mockSettingsService.getProjectSettings = vi.fn().mockResolvedValue({
        integrations: {},
      } as ProjectSettings);

      try {
        await client.createIssue({
          title: 'Test Issue',
          teamId: 'team-123',
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(LinearAPIError);
        expect((error as LinearAPIError).message).toContain('No Linear API token configured');
        expect((error as LinearAPIError).isTokenExpired).toBe(true);
      }

      // Restore env vars
      if (savedKey) process.env.LINEAR_API_KEY = savedKey;
      if (savedToken) process.env.LINEAR_API_TOKEN = savedToken;
    });

    it('should handle missing integrations in settings when no env fallback', async () => {
      // Clear env vars so fallback doesn't trigger
      const savedKey = process.env.LINEAR_API_KEY;
      const savedToken = process.env.LINEAR_API_TOKEN;
      delete process.env.LINEAR_API_KEY;
      delete process.env.LINEAR_API_TOKEN;

      mockSettingsService.getProjectSettings = vi.fn().mockResolvedValue({
        integrations: {
          linear: {},
        },
      } as ProjectSettings);

      try {
        await client.createIssue({
          title: 'Test Issue',
          teamId: 'team-123',
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(LinearAPIError);
        expect((error as LinearAPIError).isTokenExpired).toBe(true);
      }

      // Restore env vars
      if (savedKey) process.env.LINEAR_API_KEY = savedKey;
      if (savedToken) process.env.LINEAR_API_TOKEN = savedToken;
    });

    it('should use LINEAR_API_TOKEN env var as fallback', async () => {
      const savedToken = process.env.LINEAR_API_TOKEN;
      process.env.LINEAR_API_TOKEN = 'env-fallback-token';

      mockSettingsService.getProjectSettings = vi.fn().mockResolvedValue({
        integrations: { linear: {} },
      } as ProjectSettings);

      // Should succeed using env var token (mock the fetch response)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'issue-1',
                identifier: 'TEST-1',
                url: 'https://linear.app/test/issue/TEST-1',
              },
            },
          },
        }),
      } as Response);

      const result = await client.createIssue({
        title: 'Test Issue',
        teamId: 'team-123',
      });
      expect(result.issueId).toBe('issue-1');

      // Restore
      if (savedToken) {
        process.env.LINEAR_API_TOKEN = savedToken;
      } else {
        delete process.env.LINEAR_API_TOKEN;
      }
    });
  });
});
