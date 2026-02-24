import { describe, it, expect, beforeEach } from 'vitest';
import { RoleRegistryService } from '../../../src/services/role-registry-service.js';
import type { AgentTemplate } from '@protolabs-ai/types';

function makeTemplate(overrides: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    name: 'test-agent',
    displayName: 'Test Agent',
    description: 'A test agent template',
    role: 'backend-engineer',
    tier: 1,
    model: 'sonnet',
    tools: ['Read', 'Write'],
    maxTurns: 50,
    ...overrides,
  };
}

describe('RoleRegistryService', () => {
  let registry: RoleRegistryService;

  beforeEach(() => {
    registry = new RoleRegistryService();
  });

  describe('register', () => {
    it('registers a valid template', () => {
      const result = registry.register(makeTemplate());
      expect(result.success).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('rejects invalid template (bad name)', () => {
      const result = registry.register(makeTemplate({ name: 'INVALID NAME' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('rejects template with single-char name', () => {
      const result = registry.register(makeTemplate({ name: 'a' }));
      expect(result.success).toBe(false);
    });

    it('allows overwriting tier 1 templates', () => {
      registry.register(makeTemplate({ tier: 1 }));
      const result = registry.register(makeTemplate({ tier: 1, displayName: 'Updated Agent' }));
      expect(result.success).toBe(true);
      expect(registry.get('test-agent')?.displayName).toBe('Updated Agent');
    });

    it('rejects overwriting tier 0 templates', () => {
      registry.register(makeTemplate({ tier: 0 }));
      const result = registry.register(makeTemplate({ tier: 1, displayName: 'Overwrite attempt' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('protected');
    });
  });

  describe('get', () => {
    it('returns template by name', () => {
      registry.register(makeTemplate());
      const template = registry.get('test-agent');
      expect(template).toBeDefined();
      expect(template?.displayName).toBe('Test Agent');
    });

    it('returns undefined for unknown name', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('getByRole', () => {
    it('returns template by role name', () => {
      registry.register(makeTemplate({ name: 'jon', role: 'gtm-specialist' }));
      const template = registry.getByRole('gtm-specialist');
      expect(template).toBeDefined();
      expect(template?.name).toBe('jon');
    });

    it('returns undefined for unknown role', () => {
      expect(registry.getByRole('nonexistent-role')).toBeUndefined();
    });

    it('returns first match when multiple templates share a role', () => {
      registry.register(makeTemplate({ name: 'agent-aa', role: 'backend-engineer' }));
      registry.register(makeTemplate({ name: 'agent-bb', role: 'backend-engineer', tier: 1 }));
      const template = registry.getByRole('backend-engineer');
      expect(template).toBeDefined();
      expect(template?.name).toBe('agent-aa');
    });
  });

  describe('resolve', () => {
    it('resolves by name first', () => {
      registry.register(makeTemplate({ name: 'jon', role: 'gtm-specialist' }));
      const template = registry.resolve('jon');
      expect(template?.name).toBe('jon');
    });

    it('falls back to role when name not found', () => {
      registry.register(makeTemplate({ name: 'jon', role: 'gtm-specialist' }));
      const template = registry.resolve('gtm-specialist');
      expect(template?.name).toBe('jon');
    });

    it('returns undefined when neither name nor role matches', () => {
      expect(registry.resolve('nonexistent')).toBeUndefined();
    });

    it('prefers name match over role match', () => {
      registry.register(makeTemplate({ name: 'backend-engineer', role: 'backend-engineer' }));
      registry.register(makeTemplate({ name: 'custom-be', role: 'backend-engineer', tier: 1 }));
      const template = registry.resolve('backend-engineer');
      expect(template?.name).toBe('backend-engineer');
    });
  });

  describe('has', () => {
    it('returns true for registered template', () => {
      registry.register(makeTemplate());
      expect(registry.has('test-agent')).toBe(true);
    });

    it('returns false for unregistered template', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('list', () => {
    it('returns empty array when no templates', () => {
      expect(registry.list()).toEqual([]);
    });

    it('returns all templates', () => {
      registry.register(makeTemplate({ name: 'agent-aa' }));
      registry.register(makeTemplate({ name: 'agent-bb', role: 'frontend-engineer' }));
      expect(registry.list()).toHaveLength(2);
    });

    it('filters by role', () => {
      registry.register(makeTemplate({ name: 'agent-aa', role: 'backend-engineer' }));
      registry.register(makeTemplate({ name: 'agent-bb', role: 'frontend-engineer' }));

      const backends = registry.list('backend-engineer');
      expect(backends).toHaveLength(1);
      expect(backends[0].name).toBe('agent-aa');
    });

    it('returns empty when role filter has no matches', () => {
      registry.register(makeTemplate());
      expect(registry.list('qa-engineer')).toHaveLength(0);
    });
  });

  describe('unregister', () => {
    it('removes a tier 1 template', () => {
      registry.register(makeTemplate({ tier: 1 }));
      const result = registry.unregister('test-agent');
      expect(result.success).toBe(true);
      expect(registry.size).toBe(0);
    });

    it('refuses to remove tier 0 template', () => {
      registry.register(makeTemplate({ tier: 0 }));
      const result = registry.unregister('test-agent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('protected');
      expect(registry.size).toBe(1);
    });

    it('returns error for nonexistent template', () => {
      const result = registry.unregister('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getKnownRoles', () => {
    it('returns built-in role names', () => {
      const roles = registry.getKnownRoles();
      expect(roles).toContain('product-manager');
      expect(roles).toContain('backend-engineer');
      expect(roles).toContain('chief-of-staff');
    });
  });

  describe('size', () => {
    it('starts at 0', () => {
      expect(registry.size).toBe(0);
    });

    it('tracks registrations', () => {
      registry.register(makeTemplate({ name: 'agent-aa' }));
      registry.register(makeTemplate({ name: 'agent-bb' }));
      expect(registry.size).toBe(2);
    });
  });
});
