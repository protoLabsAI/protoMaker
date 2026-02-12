import { describe, it, expect, beforeEach } from 'vitest';
import { registerBuiltInTemplates } from '../../../src/services/built-in-templates.js';
import { RoleRegistryService } from '../../../src/services/role-registry-service.js';
import { createEventEmitter } from '../../../src/lib/events.js';

describe('registerBuiltInTemplates', () => {
  let registry: RoleRegistryService;

  beforeEach(() => {
    const events = createEventEmitter();
    registry = new RoleRegistryService(events);
  });

  it('registers all 9 built-in templates', () => {
    const count = registerBuiltInTemplates(registry);
    expect(count).toBe(9);
    expect(registry.size).toBe(9);
  });

  it('registers templates as tier 0 (protected)', () => {
    registerBuiltInTemplates(registry);
    const templates = registry.list();
    for (const template of templates) {
      expect(template.tier).toBe(0);
    }
  });

  it('includes all expected roles', () => {
    registerBuiltInTemplates(registry);
    const names = registry.list().map((t) => t.name);
    expect(names).toContain('backend-engineer');
    expect(names).toContain('frontend-engineer');
    expect(names).toContain('devops-engineer');
    expect(names).toContain('qa-engineer');
    expect(names).toContain('docs-engineer');
    expect(names).toContain('product-manager');
    expect(names).toContain('engineering-manager');
    expect(names).toContain('chief-of-staff');
    expect(names).toContain('gtm-specialist');
  });

  it('chief-of-staff uses opus model', () => {
    registerBuiltInTemplates(registry);
    const cos = registry.get('chief-of-staff');
    expect(cos).toBeDefined();
    expect(cos!.model).toBe('opus');
    expect(cos!.maxTurns).toBe(200);
    expect(cos!.canSpawnAgents).toBe(true);
    expect(cos!.trustLevel).toBe(3);
  });

  it('docs-engineer uses haiku model', () => {
    registerBuiltInTemplates(registry);
    const docs = registry.get('docs-engineer');
    expect(docs).toBeDefined();
    expect(docs!.model).toBe('haiku');
    expect(docs!.canUseBash).toBe(false);
  });

  it('implementation roles have full capabilities', () => {
    registerBuiltInTemplates(registry);
    for (const name of ['backend-engineer', 'frontend-engineer', 'devops-engineer']) {
      const template = registry.get(name);
      expect(template).toBeDefined();
      expect(template!.canUseBash).toBe(true);
      expect(template!.canModifyFiles).toBe(true);
      expect(template!.canCommit).toBe(true);
      expect(template!.canCreatePRs).toBe(true);
      expect(template!.trustLevel).toBe(2);
    }
  });

  it('management roles are read-only', () => {
    registerBuiltInTemplates(registry);
    for (const name of ['product-manager', 'engineering-manager']) {
      const template = registry.get(name);
      expect(template).toBeDefined();
      expect(template!.canUseBash).toBe(false);
      expect(template!.canModifyFiles).toBe(false);
      expect(template!.canCommit).toBe(false);
      expect(template!.canCreatePRs).toBe(false);
    }
  });

  it('built-in templates cannot be unregistered', () => {
    registerBuiltInTemplates(registry);
    const result = registry.unregister('backend-engineer');
    expect(result.success).toBe(false);
    expect(result.error).toContain('tier 0');
  });

  it('is idempotent — calling twice does not duplicate', () => {
    registerBuiltInTemplates(registry);
    const count2 = registerBuiltInTemplates(registry);
    // Second call may succeed (overwrite) or fail, but total should still be 9
    expect(registry.size).toBe(9);
  });
});
