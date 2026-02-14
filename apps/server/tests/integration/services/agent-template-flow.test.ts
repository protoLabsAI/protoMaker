/**
 * Integration test: Agent Template Flow
 *
 * Tests the full lifecycle: register template → create config via factory → execute agent
 * This validates that the registry, factory, and executor work together correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RoleRegistryService } from '../../../src/services/role-registry-service.js';
import { AgentFactoryService } from '../../../src/services/agent-factory-service.js';
import { registerBuiltInTemplates } from '../../../src/services/built-in-templates.js';
import { createEventEmitter } from '../../../src/lib/events.js';
import type { AgentTemplate } from '@automaker/types';

describe('Agent Template Flow (integration)', () => {
  let registry: RoleRegistryService;
  let factory: AgentFactoryService;

  beforeEach(() => {
    const events = createEventEmitter();
    registry = new RoleRegistryService(events);
    factory = new AgentFactoryService(registry, events);
  });

  describe('built-in templates → factory', () => {
    it('creates config from built-in backend-engineer template', () => {
      registerBuiltInTemplates(registry);

      const config = factory.createFromTemplate('backend-engineer', '/test/project');

      expect(config).toBeDefined();
      expect(config.templateName).toBe('backend-engineer');
      expect(config.role).toBe('backend-engineer');
      expect(config.resolvedModel).toContain('sonnet');
      expect(config.maxTurns).toBe(100);
      expect(config.projectPath).toBe('/test/project');
      expect(config.capabilities.canUseBash).toBe(true);
      expect(config.capabilities.canModifyFiles).toBe(true);
      expect(config.capabilities.canCommit).toBe(true);
      expect(config.capabilities.canCreatePRs).toBe(true);
      expect(config.trustLevel).toBe(2);
    });

    it('creates config from built-in ava template (opus)', () => {
      registerBuiltInTemplates(registry);

      const config = factory.createFromTemplate('ava', '/test/project');

      expect(config.resolvedModel).toContain('opus');
      expect(config.maxTurns).toBe(200);
      expect(config.capabilities.canSpawnAgents).toBe(true);
      expect(config.trustLevel).toBe(3);
    });

    it('creates config for all built-in templates without errors', () => {
      const count = registerBuiltInTemplates(registry);
      const templates = registry.list();

      expect(templates).toHaveLength(count);

      for (const template of templates) {
        const config = factory.createFromTemplate(template.name, '/test/project');
        expect(config).toBeDefined();
        expect(config.templateName).toBe(template.name);
        expect(config.role).toBe(template.role);
        expect(config.projectPath).toBe('/test/project');
      }
    });
  });

  describe('register custom → factory → verify', () => {
    it('registers a custom template and creates config', () => {
      const customTemplate: AgentTemplate = {
        name: 'security-auditor',
        displayName: 'Security Auditor',
        description: 'Scans codebase for security vulnerabilities',
        role: 'qa-engineer',
        tier: 1,
        model: 'sonnet',
        maxTurns: 50,
        canUseBash: true,
        canModifyFiles: false,
        tags: ['security', 'audit'],
      };

      const result = registry.register(customTemplate);
      expect(result.success).toBe(true);

      const config = factory.createFromTemplate('security-auditor', '/test/project');
      expect(config.templateName).toBe('security-auditor');
      expect(config.role).toBe('qa-engineer');
      expect(config.resolvedModel).toContain('sonnet');
      expect(config.maxTurns).toBe(50);
      expect(config.capabilities.canUseBash).toBe(true);
      expect(config.capabilities.canModifyFiles).toBe(false);
    });

    it('applies overrides when creating config', () => {
      const template: AgentTemplate = {
        name: 'test-agent',
        displayName: 'Test Agent',
        description: 'For testing',
        role: 'backend-engineer',
        tier: 1,
        model: 'sonnet',
        maxTurns: 100,
      };

      registry.register(template);

      const config = factory.createFromTemplate('test-agent', '/test/project', {
        maxTurns: 25,
        model: 'haiku',
      });

      expect(config.maxTurns).toBe(25);
      expect(config.resolvedModel).toContain('haiku');
    });
  });

  describe('tier protection in full flow', () => {
    it('prevents updating built-in templates through the flow', () => {
      registerBuiltInTemplates(registry);

      // Can't unregister tier 0
      const unregResult = registry.unregister('backend-engineer');
      expect(unregResult.success).toBe(false);

      // Original still works via factory
      const config = factory.createFromTemplate('backend-engineer', '/test/project');
      expect(config).toBeDefined();
      expect(config.resolvedModel).toContain('sonnet');
    });

    it('custom templates can be updated and re-resolved', () => {
      const template: AgentTemplate = {
        name: 'evolving-agent',
        displayName: 'Evolving Agent',
        description: 'Changes over time',
        role: 'backend-engineer',
        tier: 1,
        model: 'haiku',
        maxTurns: 50,
      };

      registry.register(template);

      // First config
      const config1 = factory.createFromTemplate('evolving-agent', '/test/project');
      expect(config1.resolvedModel).toContain('haiku');

      // Update the template
      registry.unregister('evolving-agent');
      registry.register({ ...template, model: 'sonnet', maxTurns: 200 });

      // New config reflects update
      const config2 = factory.createFromTemplate('evolving-agent', '/test/project');
      expect(config2.resolvedModel).toContain('sonnet');
      expect(config2.maxTurns).toBe(200);
    });
  });

  describe('mixed built-in and custom', () => {
    it('built-in and custom templates coexist', () => {
      const builtInCount = registerBuiltInTemplates(registry);

      const custom: AgentTemplate = {
        name: 'data-analyst',
        displayName: 'Data Analyst',
        description: 'Analyzes data and generates reports',
        role: 'backend-engineer',
        tier: 1,
        model: 'sonnet',
        maxTurns: 75,
        tags: ['data', 'analysis'],
      };

      registry.register(custom);

      // Total should be built-in + 1 custom
      expect(registry.size).toBe(builtInCount + 1);

      // Both resolve correctly
      const builtIn = factory.createFromTemplate('backend-engineer', '/test/project');
      expect(builtIn.templateName).toBe('backend-engineer');

      const customConfig = factory.createFromTemplate('data-analyst', '/test/project');
      expect(customConfig.templateName).toBe('data-analyst');
    });

    it('listing by role returns mixed results', () => {
      registerBuiltInTemplates(registry);

      const custom: AgentTemplate = {
        name: 'api-specialist',
        displayName: 'API Specialist',
        description: 'Builds REST APIs',
        role: 'backend-engineer',
        tier: 1,
        model: 'sonnet',
      };

      registry.register(custom);

      const backendTemplates = registry.list('backend-engineer');
      expect(backendTemplates.length).toBeGreaterThanOrEqual(2);

      const names = backendTemplates.map((t) => t.name);
      expect(names).toContain('backend-engineer');
      expect(names).toContain('api-specialist');
    });
  });

  describe('error cases', () => {
    it('factory throws for non-existent template', () => {
      expect(() => factory.createFromTemplate('non-existent', '/test/project')).toThrow();
    });

    it('registry rejects invalid template names', () => {
      const result = registry.register({
        name: 'Invalid Name With Spaces',
        displayName: 'Test',
        description: 'Test',
        role: 'backend-engineer',
        tier: 1,
      } as AgentTemplate);

      expect(result.success).toBe(false);
    });
  });
});
