import { describe, it, expect, beforeEach } from 'vitest';
import { AgentFactoryService } from '../../../src/services/agent-factory-service.js';
import { RoleRegistryService } from '../../../src/services/role-registry-service.js';
import type { AgentTemplate } from '@automaker/types';

function makeTemplate(overrides: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    name: 'test-agent',
    displayName: 'Test Agent',
    description: 'A test agent template',
    role: 'backend-engineer',
    tier: 1,
    model: 'sonnet',
    tools: ['Read', 'Write', 'Bash'],
    maxTurns: 50,
    trustLevel: 1,
    canUseBash: true,
    canModifyFiles: true,
    canCommit: true,
    canCreatePRs: false,
    ...overrides,
  };
}

describe('AgentFactoryService', () => {
  let registry: RoleRegistryService;
  let factory: AgentFactoryService;

  beforeEach(() => {
    registry = new RoleRegistryService();
    factory = new AgentFactoryService(registry);
  });

  describe('createFromTemplate', () => {
    it('creates config from a registered template', () => {
      const template = makeTemplate();
      registry.register(template);

      const config = factory.createFromTemplate('test-agent', '/project');

      expect(config.templateName).toBe('test-agent');
      expect(config.modelAlias).toBe('sonnet');
      expect(config.resolvedModel).toContain('sonnet');
      expect(config.tools).toEqual(['Read', 'Write', 'Bash']);
      expect(config.maxTurns).toBe(50);
      expect(config.role).toBe('backend-engineer');
      expect(config.displayName).toBe('Test Agent');
      expect(config.trustLevel).toBe(1);
      expect(config.projectPath).toBe('/project');
      expect(config.capabilities.canUseBash).toBe(true);
      expect(config.capabilities.canCreatePRs).toBe(false);
    });

    it('throws when template not found', () => {
      expect(() => factory.createFromTemplate('nonexistent', '/project')).toThrow(
        'Template "nonexistent" not found'
      );
    });

    it('applies model override', () => {
      registry.register(makeTemplate());

      const config = factory.createFromTemplate('test-agent', '/project', {
        model: 'opus',
      });

      expect(config.modelAlias).toBe('opus');
      expect(config.resolvedModel).toContain('opus');
    });

    it('applies maxTurns override', () => {
      registry.register(makeTemplate());

      const config = factory.createFromTemplate('test-agent', '/project', {
        maxTurns: 200,
      });

      expect(config.maxTurns).toBe(200);
    });

    it('merges tools additively', () => {
      registry.register(makeTemplate({ tools: ['Read', 'Write'] }));

      const config = factory.createFromTemplate('test-agent', '/project', {
        tools: ['Bash', 'Grep'],
      });

      expect(config.tools).toContain('Read');
      expect(config.tools).toContain('Write');
      expect(config.tools).toContain('Bash');
      expect(config.tools).toContain('Grep');
    });

    it('deduplicates tools on merge', () => {
      registry.register(makeTemplate({ tools: ['Read', 'Write'] }));

      const config = factory.createFromTemplate('test-agent', '/project', {
        tools: ['Read', 'Bash'],
      });

      const readCount = config.tools.filter((t) => t === 'Read').length;
      expect(readCount).toBe(1);
    });

    it('applies capability overrides', () => {
      registry.register(makeTemplate({ canUseBash: false }));

      const config = factory.createFromTemplate('test-agent', '/project', {
        canUseBash: true,
      });

      expect(config.capabilities.canUseBash).toBe(true);
    });

    it('uses defaults when template fields are missing', () => {
      registry.register(
        makeTemplate({
          model: undefined,
          maxTurns: undefined,
          trustLevel: undefined,
          tools: undefined,
        })
      );

      const config = factory.createFromTemplate('test-agent', '/project');

      expect(config.modelAlias).toBe('sonnet');
      expect(config.maxTurns).toBe(100);
      expect(config.trustLevel).toBe(1);
      expect(config.tools).toEqual([]);
    });
  });

  describe('createWithInheritance', () => {
    it('inherits from parent template', () => {
      const parent = makeTemplate({
        name: 'parent-agent',
        model: 'sonnet',
        tools: ['Read', 'Write'],
        maxTurns: 100,
      });
      registry.register(parent);

      const config = factory.createWithInheritance(
        'parent-agent',
        {
          name: 'child-agent',
          displayName: 'Child Agent',
          description: 'Extended from parent',
          role: 'backend-engineer',
          model: 'opus',
        },
        '/project'
      );

      expect(config.modelAlias).toBe('opus');
      expect(config.tools).toContain('Read');
      expect(config.tools).toContain('Write');
      expect(config.maxTurns).toBe(100);
      expect(config.displayName).toBe('Child Agent');
    });

    it('merges tools additively from parent and child', () => {
      registry.register(makeTemplate({ name: 'parent-agent', tools: ['Read'] }));

      const config = factory.createWithInheritance(
        'parent-agent',
        {
          name: 'child-agent',
          displayName: 'Child',
          description: 'Test',
          role: 'backend-engineer',
          tools: ['Bash'],
        },
        '/project'
      );

      expect(config.tools).toContain('Read');
      expect(config.tools).toContain('Bash');
    });

    it('throws when parent not found', () => {
      expect(() =>
        factory.createWithInheritance(
          'nonexistent',
          {
            name: 'child-agent',
            displayName: 'Child',
            description: 'Test',
            role: 'backend-engineer',
          },
          '/project'
        )
      ).toThrow('Parent template "nonexistent" not found');
    });

    it('validates the merged template', () => {
      registry.register(makeTemplate({ name: 'parent-agent' }));

      expect(() =>
        factory.createWithInheritance(
          'parent-agent',
          {
            name: 'INVALID NAME', // kebab-case violation
            displayName: 'Child',
            description: 'Test',
            role: 'backend-engineer',
          },
          '/project'
        )
      ).toThrow('failed validation');
    });
  });

  describe('getAvailableTemplates', () => {
    it('returns empty list when no templates', () => {
      expect(factory.getAvailableTemplates()).toEqual([]);
    });

    it('returns all registered templates', () => {
      registry.register(makeTemplate({ name: 'agent-aa' }));
      registry.register(
        makeTemplate({
          name: 'agent-bb',
          displayName: 'Agent BB',
          role: 'frontend-engineer',
        })
      );

      const available = factory.getAvailableTemplates();
      expect(available).toHaveLength(2);
      expect(available[0]).toEqual({
        name: 'agent-aa',
        displayName: 'Test Agent',
        role: 'backend-engineer',
      });
      expect(available[1]).toEqual({
        name: 'agent-bb',
        displayName: 'Agent BB',
        role: 'frontend-engineer',
      });
    });
  });

  describe('environment', () => {
    it('defaults to development when no environment specified', () => {
      registry.register(makeTemplate());
      const config = factory.createFromTemplate('test-agent', '/project');
      expect(config.environment).toBe('development');
    });

    it('uses environment from constructor', () => {
      const stagingFactory = new AgentFactoryService(registry, undefined, 'staging');
      registry.register(makeTemplate());
      const config = stagingFactory.createFromTemplate('test-agent', '/project');
      expect(config.environment).toBe('staging');
    });

    it('passes production environment through', () => {
      const prodFactory = new AgentFactoryService(registry, undefined, 'production');
      registry.register(makeTemplate());
      const config = prodFactory.createFromTemplate('test-agent', '/project');
      expect(config.environment).toBe('production');
    });
  });

  describe('desiredState pass-through', () => {
    it('returns undefined when template has no desiredState', () => {
      registry.register(makeTemplate());
      const config = factory.createFromTemplate('test-agent', '/project');
      expect(config.desiredState).toBeUndefined();
    });

    it('passes desiredState through when schema includes it', () => {
      const templateWithState = makeTemplate();
      (templateWithState as Record<string, unknown>).desiredState = [
        { key: 'backlog_count', operator: '>', value: 0, priority: 8 },
      ];
      registry.register(templateWithState);

      const config = factory.createFromTemplate('test-agent', '/project');
      expect(config.desiredState).toBeDefined();
      expect(config.desiredState).toHaveLength(1);
      expect(config.desiredState![0].key).toBe('backlog_count');
    });
  });
});
