/**
 * Unit tests for the agent API route handlers.
 *
 * Tests the createAgentRoutes factory directly without spinning up a full HTTP server.
 *
 * Covers:
 * - POST /list  — returns merged built-in + project agents
 * - POST /get   — returns single agent with capabilities; built-in fallback
 * - POST /match — matches best agent for a feature; feature not found; no match
 * - Input validation (missing projectPath, agentName, featureId)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock the logger before any route imports
vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock the AgentManifestService singleton
vi.mock('@/services/agent-manifest-service.js', () => ({
  getAgentManifestService: vi.fn(),
}));

import { createAgentRoutes } from '@/routes/agents.js';
import { getAgentManifestService } from '@/services/agent-manifest-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import type { ProjectAgent } from '@protolabsai/types';
import { BUILT_IN_AGENT_ROLES, ROLE_CAPABILITIES } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(body: Record<string, unknown> = {}): Request {
  return { body } as unknown as Request;
}

function makeRes() {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

/** Extract a POST handler from the router stack by path. */
function getPostHandler(
  router: ReturnType<typeof createAgentRoutes>,
  routePath: string
): ((req: Request, res: Response) => Promise<void>) | undefined {
  const stack = (
    router as unknown as {
      stack: Array<{
        route?: {
          path: string;
          stack: Array<{ method: string; handle: (req: Request, res: Response) => Promise<void> }>;
        };
      }>;
    }
  ).stack;

  const layer = stack.find((l) => l.route?.path === routePath);
  return layer?.route?.stack.find((s) => s.method === 'post')?.handle;
}

function createMockService(overrides: Partial<ReturnType<typeof buildDefaultService>> = {}) {
  return { ...buildDefaultService(), ...overrides };
}

function buildDefaultService() {
  return {
    getAgentsForProject: vi.fn().mockResolvedValue(null),
    getAgent: vi.fn().mockResolvedValue(undefined),
    getResolvedCapabilities: vi.fn().mockResolvedValue(null),
    matchFeature: vi.fn().mockResolvedValue(null),
  };
}

function createMockFeatureLoader(overrides: Partial<FeatureLoader> = {}): FeatureLoader {
  return {
    get: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as FeatureLoader;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAgentRoutes', () => {
  let mockService: ReturnType<typeof createMockService>;
  let mockFeatureLoader: FeatureLoader;

  beforeEach(() => {
    mockService = createMockService();
    vi.mocked(getAgentManifestService).mockReturnValue(mockService as any);
    mockFeatureLoader = createMockFeatureLoader();
  });

  // ── POST /list ─────────────────────────────────────────────────────────────

  describe('POST /list', () => {
    it('returns 400 when projectPath is missing', async () => {
      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/list')!;

      const req = makeReq({});
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'projectPath is required' });
    });

    it('returns all 8 built-in agents when project has no manifest', async () => {
      mockService.getAgentsForProject.mockResolvedValue(null);

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/list')!;

      const req = makeReq({ projectPath: '/test/project' });
      const res = makeRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          projectPath: '/test/project',
          count: BUILT_IN_AGENT_ROLES.length,
          agents: expect.arrayContaining([
            expect.objectContaining({ name: 'backend-engineer', _builtIn: true }),
            expect.objectContaining({ name: 'frontend-engineer', _builtIn: true }),
          ]),
        })
      );
    });

    it('merges project agents with built-ins, project agents replacing same-named built-ins', async () => {
      const projectAgent: ProjectAgent = {
        name: 'backend-engineer',
        extends: 'backend-engineer',
        description: 'Custom backend agent',
      };
      mockService.getAgentsForProject.mockResolvedValue({
        version: '1',
        agents: [projectAgent],
      });

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/list')!;

      const req = makeReq({ projectPath: '/test/project' });
      const res = makeRes();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.success).toBe(true);
      // Total count: 7 built-ins (backend-engineer replaced) + 1 project agent
      expect(response.count).toBe(BUILT_IN_AGENT_ROLES.length);

      const backendAgent = response.agents.find((a: ProjectAgent) => a.name === 'backend-engineer');
      // Should be the project agent (no _builtIn flag)
      expect(backendAgent._builtIn).toBeUndefined();
      expect(backendAgent.description).toBe('Custom backend agent');
    });

    it('includes project-specific agents in addition to built-ins', async () => {
      const projectAgent: ProjectAgent = {
        name: 'react-specialist',
        extends: 'frontend-engineer',
        description: 'React specialist',
      };
      mockService.getAgentsForProject.mockResolvedValue({
        version: '1',
        agents: [projectAgent],
      });

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/list')!;

      const req = makeReq({ projectPath: '/test/project' });
      const res = makeRes();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      // All 8 built-ins + 1 project agent (no name collision)
      expect(response.count).toBe(BUILT_IN_AGENT_ROLES.length + 1);
      expect(response.agents).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'react-specialist' })])
      );
    });

    it('returns 500 when service throws', async () => {
      mockService.getAgentsForProject.mockRejectedValue(new Error('Disk error'));

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/list')!;

      const req = makeReq({ projectPath: '/test/project' });
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Failed to list agents', message: 'Disk error' })
      );
    });
  });

  // ── POST /get ──────────────────────────────────────────────────────────────

  describe('POST /get', () => {
    it('returns 400 when projectPath is missing', async () => {
      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/get')!;

      const req = makeReq({ agentName: 'backend-engineer' });
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'projectPath is required' });
    });

    it('returns 400 when agentName is missing', async () => {
      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/get')!;

      const req = makeReq({ projectPath: '/test/project' });
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'agentName is required' });
    });

    it('returns 404 when agent is not found and not a built-in role', async () => {
      mockService.getAgent.mockResolvedValue(undefined);

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/get')!;

      const req = makeReq({ projectPath: '/test/project', agentName: 'unknown-agent' });
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Agent "unknown-agent" not found' });
    });

    it('returns built-in role as synthetic agent when not in project manifest', async () => {
      // Simulate: not in project manifest, but is a built-in role
      mockService.getAgent.mockResolvedValue(undefined);
      mockService.getResolvedCapabilities.mockResolvedValue(null);

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/get')!;

      const req = makeReq({ projectPath: '/test/project', agentName: 'backend-engineer' });
      const res = makeRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          projectPath: '/test/project',
          agent: expect.objectContaining({
            name: 'backend-engineer',
            extends: 'backend-engineer',
          }),
          capabilities: expect.objectContaining({
            role: 'backend-engineer',
            canUseBash: true,
          }),
        })
      );
      // Verify no 404 was called
      expect(res.status).not.toHaveBeenCalledWith(404);
    });

    it('returns project agent with resolved capabilities', async () => {
      const projectAgent: ProjectAgent = {
        name: 'react-specialist',
        extends: 'frontend-engineer',
        description: 'React expert',
      };
      const capabilities = ROLE_CAPABILITIES['frontend-engineer'];

      mockService.getAgent.mockResolvedValue(projectAgent);
      mockService.getResolvedCapabilities.mockResolvedValue(capabilities);

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/get')!;

      const req = makeReq({ projectPath: '/test/project', agentName: 'react-specialist' });
      const res = makeRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        projectPath: '/test/project',
        agent: projectAgent,
        capabilities,
      });
    });

    it('falls back to ROLE_CAPABILITIES when getResolvedCapabilities returns null for built-in', async () => {
      // Agent found in manifest but getResolvedCapabilities returns null (e.g. missing base role)
      const projectAgent: ProjectAgent = {
        name: 'frontend-engineer',
        extends: 'frontend-engineer',
        description: 'Override of built-in',
      };
      mockService.getAgent.mockResolvedValue(projectAgent);
      mockService.getResolvedCapabilities.mockResolvedValue(null);

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/get')!;

      const req = makeReq({ projectPath: '/test/project', agentName: 'frontend-engineer' });
      const res = makeRes();
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.capabilities).toEqual(ROLE_CAPABILITIES['frontend-engineer']);
    });

    it('returns 500 when service throws', async () => {
      mockService.getAgent.mockRejectedValue(new Error('Service failure'));

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/get')!;

      const req = makeReq({ projectPath: '/test/project', agentName: 'backend-engineer' });
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Failed to get agent', message: 'Service failure' })
      );
    });
  });

  // ── POST /match ────────────────────────────────────────────────────────────

  describe('POST /match', () => {
    it('returns 400 when projectPath is missing', async () => {
      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/match')!;

      const req = makeReq({ featureId: 'feat-123' });
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'projectPath is required' });
    });

    it('returns 400 when featureId is missing', async () => {
      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/match')!;

      const req = makeReq({ projectPath: '/test/project' });
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'featureId is required' });
    });

    it('returns 404 when feature is not found', async () => {
      vi.mocked(mockFeatureLoader.get).mockResolvedValue(null);

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/match')!;

      const req = makeReq({ projectPath: '/test/project', featureId: 'feat-999' });
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Feature "feat-999" not found' });
    });

    it('returns matched agent with confidence when a match exists', async () => {
      const feature = {
        id: 'feat-123',
        title: 'Add React component',
        category: 'frontend',
        description: 'New UI component',
        filesToModify: ['src/components/MyComp.tsx'],
      };
      const matchedAgent: ProjectAgent = {
        name: 'react-specialist',
        extends: 'frontend-engineer',
        description: 'React expert',
      };
      const matchResult = { agent: matchedAgent, confidence: 0.67 };

      vi.mocked(mockFeatureLoader.get).mockResolvedValue(feature as any);
      mockService.matchFeature.mockResolvedValue(matchResult);

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/match')!;

      const req = makeReq({ projectPath: '/test/project', featureId: 'feat-123' });
      const res = makeRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        projectPath: '/test/project',
        featureId: 'feat-123',
        agent: matchedAgent,
        confidence: 0.67,
      });
      expect(mockService.matchFeature).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          category: 'frontend',
          title: 'Add React component',
          description: 'New UI component',
          filesToModify: ['src/components/MyComp.tsx'],
        })
      );
    });

    it('returns null agent and confidence when no match is found', async () => {
      const feature = {
        id: 'feat-456',
        title: 'Some feature',
        category: 'misc',
        description: 'No matching agent',
        filesToModify: [],
      };

      vi.mocked(mockFeatureLoader.get).mockResolvedValue(feature as any);
      mockService.matchFeature.mockResolvedValue(null);

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/match')!;

      const req = makeReq({ projectPath: '/test/project', featureId: 'feat-456' });
      const res = makeRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        projectPath: '/test/project',
        featureId: 'feat-456',
        agent: null,
        confidence: null,
      });
    });

    it('returns 500 when featureLoader throws', async () => {
      vi.mocked(mockFeatureLoader.get).mockRejectedValue(new Error('Storage unavailable'));

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/match')!;

      const req = makeReq({ projectPath: '/test/project', featureId: 'feat-123' });
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to match agent for feature',
          message: 'Storage unavailable',
        })
      );
    });

    it('returns 500 when matchFeature throws', async () => {
      const feature = { id: 'feat-123', title: 'Test', category: 'backend', description: '' };
      vi.mocked(mockFeatureLoader.get).mockResolvedValue(feature as any);
      mockService.matchFeature.mockRejectedValue(new Error('Match engine crashed'));

      const router = createAgentRoutes(mockFeatureLoader);
      const handler = getPostHandler(router, '/match')!;

      const req = makeReq({ projectPath: '/test/project', featureId: 'feat-123' });
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to match agent for feature',
          message: 'Match engine crashed',
        })
      );
    });
  });
});
