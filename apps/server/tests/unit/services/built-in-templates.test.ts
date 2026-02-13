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

  it('registers all 12 built-in templates', () => {
    const count = registerBuiltInTemplates(registry);
    expect(count).toBe(12);
    expect(registry.size).toBe(12);
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
    expect(names).toContain('matt');
    expect(names).toContain('frank');
    expect(names).toContain('qa-engineer');
    expect(names).toContain('docs-engineer');
    expect(names).toContain('product-manager');
    expect(names).toContain('engineering-manager');
    expect(names).toContain('ava');
    expect(names).toContain('jon');
    expect(names).toContain('sam');
    expect(names).toContain('pr-maintainer');
    expect(names).toContain('board-janitor');
  });

  it('ava uses opus model', () => {
    registerBuiltInTemplates(registry);
    const cos = registry.get('ava');
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
    for (const name of ['backend-engineer', 'matt', 'sam', 'frank']) {
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
    // Second call may succeed (overwrite) or fail, but total should still be 12
    expect(registry.size).toBe(12);
  });

  it('ava has systemPrompt for Discord routing', () => {
    registerBuiltInTemplates(registry);
    const cos = registry.get('ava');
    expect(cos).toBeDefined();
    expect(cos!.systemPrompt).toBeDefined();
    expect(cos!.systemPrompt).toContain('Ava Loveland');
    expect(cos!.systemPrompt).toContain('Chief of Staff');
    expect(cos!.systemPrompt).toContain('Prime Directive');
  });

  it('matt has systemPrompt for Discord routing', () => {
    registerBuiltInTemplates(registry);
    const matt = registry.get('matt');
    expect(matt).toBeDefined();
    expect(matt!.systemPrompt).toBeDefined();
    expect(matt!.systemPrompt).toContain('Matt');
    expect(matt!.systemPrompt).toContain('Frontend');
    expect(matt!.role).toBe('frontend-engineer');
    expect(matt!.exposure?.discord).toBe(true);
  });

  it('sam has systemPrompt for AI agent engineering', () => {
    registerBuiltInTemplates(registry);
    const sam = registry.get('sam');
    expect(sam).toBeDefined();
    expect(sam!.systemPrompt).toBeDefined();
    expect(sam!.systemPrompt).toContain('Sam');
    expect(sam!.systemPrompt).toContain('AI Agent Engineer');
    expect(sam!.role).toBe('backend-engineer');
    expect(sam!.model).toBe('sonnet');
    expect(sam!.exposure?.discord).toBe(true);
  });

  it('jon has systemPrompt for Discord routing', () => {
    registerBuiltInTemplates(registry);
    const gtm = registry.get('jon');
    expect(gtm).toBeDefined();
    expect(gtm!.systemPrompt).toBeDefined();
    expect(gtm!.systemPrompt).toContain('GTM');
    expect(gtm!.systemPrompt).toContain('protoLabs');
    expect(gtm!.systemPrompt).toContain('Josh Mabry');
  });

  it('pr-maintainer uses haiku with commit capabilities', () => {
    registerBuiltInTemplates(registry);
    const prm = registry.get('pr-maintainer');
    expect(prm).toBeDefined();
    expect(prm!.model).toBe('haiku');
    expect(prm!.maxTurns).toBe(50);
    expect(prm!.canUseBash).toBe(true);
    expect(prm!.canModifyFiles).toBe(true);
    expect(prm!.canCommit).toBe(true);
    expect(prm!.canCreatePRs).toBe(true);
    expect(prm!.trustLevel).toBe(2);
    expect(prm!.systemPrompt).toContain('PR Maintainer');
  });

  it('board-janitor uses haiku with read-only board access', () => {
    registerBuiltInTemplates(registry);
    const bj = registry.get('board-janitor');
    expect(bj).toBeDefined();
    expect(bj!.model).toBe('haiku');
    expect(bj!.maxTurns).toBe(30);
    expect(bj!.canUseBash).toBe(false);
    expect(bj!.canModifyFiles).toBe(false);
    expect(bj!.canCommit).toBe(false);
    expect(bj!.canCreatePRs).toBe(false);
    expect(bj!.trustLevel).toBe(1);
    expect(bj!.systemPrompt).toContain('Board Janitor');
  });
});
