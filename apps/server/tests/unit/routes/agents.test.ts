import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createListTemplatesHandler } from '@/routes/agents/routes/list-templates.js';
import { createGetTemplateHandler } from '@/routes/agents/routes/get-template.js';
import { createRegisterTemplateHandler } from '@/routes/agents/routes/register-template.js';
import { createUpdateTemplateHandler } from '@/routes/agents/routes/update-template.js';
import { createUnregisterTemplateHandler } from '@/routes/agents/routes/unregister-template.js';
import { createExecuteHandler } from '@/routes/agents/routes/execute.js';
import type { RoleRegistryService } from '@/services/role-registry-service.js';
import type { AgentFactoryService } from '@/services/agent-factory-service.js';
import type { DynamicAgentExecutor } from '@/services/dynamic-agent-executor.js';
import { createMockExpressContext } from '../../utils/mocks.js';

// Valid template for testing
const validTemplate = {
  name: 'test-agent',
  displayName: 'Test Agent',
  description: 'A test agent',
  role: 'backend-engineer' as const,
  tier: 1 as const,
  model: 'sonnet' as const,
  tags: ['test'],
};

const protectedTemplate = {
  ...validTemplate,
  name: 'system-agent',
  displayName: 'System Agent',
  tier: 0 as const,
};

function createMockRegistry(): Partial<RoleRegistryService> {
  return {
    list: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(undefined),
    register: vi.fn().mockReturnValue({ success: true }),
    unregister: vi.fn().mockReturnValue({ success: true }),
  };
}

function createMockFactory(): Partial<AgentFactoryService> {
  return {
    createFromTemplate: vi.fn(),
  };
}

function createMockExecutor(): Partial<DynamicAgentExecutor> {
  return {
    execute: vi.fn(),
  };
}

describe('agent management routes', () => {
  let registry: Partial<RoleRegistryService>;
  let factory: Partial<AgentFactoryService>;
  let executor: Partial<DynamicAgentExecutor>;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = createMockRegistry();
    factory = createMockFactory();
    executor = createMockExecutor();
    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
  });

  describe('POST /templates/list', () => {
    it('returns empty list when no templates registered', async () => {
      const handler = createListTemplatesHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(registry.list).toHaveBeenCalledWith(undefined);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        templates: [],
        count: 0,
      });
    });

    it('returns templates with summary fields', async () => {
      vi.mocked(registry.list!).mockReturnValue([validTemplate as any]);

      const handler = createListTemplatesHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        templates: [
          {
            name: 'test-agent',
            displayName: 'Test Agent',
            description: 'A test agent',
            role: 'backend-engineer',
            tier: 1,
            model: 'sonnet',
            tags: ['test'],
          },
        ],
        count: 1,
      });
    });

    it('filters by role when provided', async () => {
      req.body = { role: 'backend-engineer' };
      vi.mocked(registry.list!).mockReturnValue([validTemplate as any]);

      const handler = createListTemplatesHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(registry.list).toHaveBeenCalledWith('backend-engineer');
    });

    it('handles errors gracefully', async () => {
      vi.mocked(registry.list!).mockImplementation(() => {
        throw new Error('Registry error');
      });

      const handler = createListTemplatesHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Registry error',
      });
    });
  });

  describe('POST /templates/get', () => {
    it('returns 400 when name is missing', async () => {
      req.body = {};

      const handler = createGetTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'name is required',
      });
    });

    it('returns 404 when template not found', async () => {
      req.body = { name: 'nonexistent' };

      const handler = createGetTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Template "nonexistent" not found',
      });
    });

    it('returns template when found', async () => {
      req.body = { name: 'test-agent' };
      vi.mocked(registry.get!).mockReturnValue(validTemplate as any);

      const handler = createGetTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        template: validTemplate,
      });
    });
  });

  describe('POST /templates/register', () => {
    it('returns 400 when template is missing', async () => {
      req.body = {};

      const handler = createRegisterTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'template is required',
      });
    });

    it('registers valid template', async () => {
      req.body = { template: validTemplate };

      const handler = createRegisterTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(registry.register).toHaveBeenCalledWith(validTemplate);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        name: 'test-agent',
      });
    });

    it('returns 400 when registration fails (validation error)', async () => {
      req.body = { template: { name: 'bad' } };
      vi.mocked(registry.register!).mockReturnValue({
        success: false,
        error: 'Validation failed: displayName is required',
      });

      const handler = createRegisterTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed: displayName is required',
      });
    });

    it('returns 400 when trying to overwrite tier 0 template', async () => {
      req.body = { template: protectedTemplate };
      vi.mocked(registry.register!).mockReturnValue({
        success: false,
        error: 'Cannot overwrite protected template "system-agent" (tier 0)',
      });

      const handler = createRegisterTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /templates/update', () => {
    it('returns 400 when name is missing', async () => {
      req.body = { updates: { model: 'opus' } };

      const handler = createUpdateTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'name is required',
      });
    });

    it('returns 400 when updates is empty', async () => {
      req.body = { name: 'test-agent', updates: {} };

      const handler = createUpdateTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'updates object is required',
      });
    });

    it('returns 404 when template not found', async () => {
      req.body = { name: 'nonexistent', updates: { model: 'opus' } };

      const handler = createUpdateTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 403 when trying to update tier 0 template', async () => {
      req.body = { name: 'system-agent', updates: { model: 'opus' } };
      vi.mocked(registry.get!).mockReturnValue(protectedTemplate as any);

      const handler = createUpdateTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot update protected template "system-agent" (tier 0)',
      });
    });

    it('merges updates and re-registers', async () => {
      req.body = { name: 'test-agent', updates: { model: 'opus' } };
      vi.mocked(registry.get!).mockReturnValue(validTemplate as any);

      const handler = createUpdateTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(registry.register).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-agent',
          model: 'opus',
          displayName: 'Test Agent',
        })
      );
    });

    it('prevents name change in updates', async () => {
      req.body = { name: 'test-agent', updates: { name: 'hijacked-name' } };
      vi.mocked(registry.get!).mockReturnValue(validTemplate as any);

      const handler = createUpdateTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      // The register call should use original name, not the hijacked one
      expect(registry.register).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-agent' })
      );
    });
  });

  describe('POST /templates/unregister', () => {
    it('returns 400 when name is missing', async () => {
      req.body = {};

      const handler = createUnregisterTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'name is required',
      });
    });

    it('unregisters existing template', async () => {
      req.body = { name: 'test-agent' };

      const handler = createUnregisterTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(registry.unregister).toHaveBeenCalledWith('test-agent');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 404 when template not found', async () => {
      req.body = { name: 'nonexistent' };
      vi.mocked(registry.unregister!).mockReturnValue({
        success: false,
        error: 'Template "nonexistent" not found',
      });
      // get returns undefined for not-found, so status will be 404
      vi.mocked(registry.get!).mockReturnValue(undefined);

      const handler = createUnregisterTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 403 when trying to unregister tier 0 template', async () => {
      req.body = { name: 'system-agent' };
      vi.mocked(registry.unregister!).mockReturnValue({
        success: false,
        error: 'Cannot unregister protected template "system-agent" (tier 0)',
      });
      // get returns the template (it exists but is protected)
      vi.mocked(registry.get!).mockReturnValue(protectedTemplate as any);

      const handler = createUnregisterTemplateHandler(registry as RoleRegistryService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('POST /execute', () => {
    const mockConfig = {
      templateName: 'test-agent',
      resolvedModel: 'claude-sonnet-4-5-20250929',
      modelAlias: 'sonnet',
      tools: [],
      disallowedTools: [],
      maxTurns: 100,
      role: 'backend-engineer',
      displayName: 'Test Agent',
      trustLevel: 1,
      capabilities: {
        canUseBash: true,
        canModifyFiles: true,
        canCommit: true,
        canCreatePRs: true,
        canSpawnAgents: false,
      },
      allowedSubagentRoles: [],
      projectPath: '/test/project',
    };

    const mockResult = {
      success: true,
      output: 'Task completed successfully.',
      durationMs: 5000,
      templateName: 'test-agent',
      model: 'sonnet',
    };

    it('returns 400 when templateName is missing', async () => {
      req.body = { projectPath: '/test', prompt: 'Do something' };

      const handler = createExecuteHandler(
        factory as AgentFactoryService,
        executor as DynamicAgentExecutor
      );
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'templateName is required',
      });
    });

    it('returns 400 when projectPath is missing', async () => {
      req.body = { templateName: 'test-agent', prompt: 'Do something' };

      const handler = createExecuteHandler(
        factory as AgentFactoryService,
        executor as DynamicAgentExecutor
      );
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
    });

    it('returns 400 when prompt is missing', async () => {
      req.body = { templateName: 'test-agent', projectPath: '/test' };

      const handler = createExecuteHandler(
        factory as AgentFactoryService,
        executor as DynamicAgentExecutor
      );
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'prompt is required',
      });
    });

    it('executes agent with valid request', async () => {
      req.body = {
        templateName: 'test-agent',
        projectPath: '/test/project',
        prompt: 'Implement the feature',
      };
      vi.mocked(factory.createFromTemplate!).mockReturnValue(mockConfig as any);
      vi.mocked(executor.execute!).mockResolvedValue(mockResult as any);

      const handler = createExecuteHandler(
        factory as AgentFactoryService,
        executor as DynamicAgentExecutor
      );
      await handler(req, res);

      expect(factory.createFromTemplate).toHaveBeenCalledWith(
        'test-agent',
        '/test/project',
        undefined
      );
      expect(executor.execute).toHaveBeenCalledWith(mockConfig, {
        prompt: 'Implement the feature',
        additionalSystemPrompt: undefined,
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('passes overrides to factory', async () => {
      req.body = {
        templateName: 'test-agent',
        projectPath: '/test/project',
        prompt: 'Do it',
        overrides: { model: 'opus', maxTurns: 50 },
      };
      vi.mocked(factory.createFromTemplate!).mockReturnValue(mockConfig as any);
      vi.mocked(executor.execute!).mockResolvedValue(mockResult as any);

      const handler = createExecuteHandler(
        factory as AgentFactoryService,
        executor as DynamicAgentExecutor
      );
      await handler(req, res);

      expect(factory.createFromTemplate).toHaveBeenCalledWith('test-agent', '/test/project', {
        model: 'opus',
        maxTurns: 50,
      });
    });

    it('returns 404 when template not found', async () => {
      req.body = {
        templateName: 'nonexistent',
        projectPath: '/test',
        prompt: 'Do it',
      };
      vi.mocked(factory.createFromTemplate!).mockImplementation(() => {
        throw new Error('Template "nonexistent" not found in registry. Available: none');
      });

      const handler = createExecuteHandler(
        factory as AgentFactoryService,
        executor as DynamicAgentExecutor
      );
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 for execution errors', async () => {
      req.body = {
        templateName: 'test-agent',
        projectPath: '/test',
        prompt: 'Do it',
      };
      vi.mocked(factory.createFromTemplate!).mockReturnValue(mockConfig as any);
      vi.mocked(executor.execute!).mockRejectedValue(new Error('API rate limit'));

      const handler = createExecuteHandler(
        factory as AgentFactoryService,
        executor as DynamicAgentExecutor
      );
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'API rate limit',
      });
    });

    it('returns failed execution result without 500', async () => {
      req.body = {
        templateName: 'test-agent',
        projectPath: '/test',
        prompt: 'Do it',
      };
      vi.mocked(factory.createFromTemplate!).mockReturnValue(mockConfig as any);
      vi.mocked(executor.execute!).mockResolvedValue({
        success: false,
        output: '',
        error: 'Agent timed out',
        errorType: 'timeout',
        durationMs: 60000,
        templateName: 'test-agent',
        model: 'sonnet',
      });

      const handler = createExecuteHandler(
        factory as AgentFactoryService,
        executor as DynamicAgentExecutor
      );
      await handler(req, res);

      // Should return 200 with success: false (execution completed but agent failed)
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Agent timed out',
          errorType: 'timeout',
        })
      );
    });
  });
});
