import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPromptForRole,
  registerPrompt,
  createPromptFromTemplate,
  listRegisteredRoles,
  hasPrompt,
} from '../src/prompt-registry.js';

describe('prompt-registry', () => {
  describe('built-in registrations', () => {
    it('registers all 8 built-in roles on import', () => {
      const roles = listRegisteredRoles();
      expect(roles).toContain('product-manager');
      expect(roles).toContain('engineering-manager');
      expect(roles).toContain('frontend-engineer');
      expect(roles).toContain('backend-engineer');
      expect(roles).toContain('devops-engineer');
      expect(roles).toContain('qa-engineer');
      expect(roles).toContain('docs-engineer');
      expect(roles).toContain('gtm-specialist');
    });
  });

  describe('getPromptForRole', () => {
    it('returns prompt for known role', () => {
      const prompt = getPromptForRole('backend-engineer', {
        projectPath: '/test/project',
      });
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('returns fallback for unknown role', () => {
      const prompt = getPromptForRole('alien-researcher', {
        projectPath: '/test/project',
      });
      expect(prompt).toContain('alien-researcher');
      expect(prompt).toContain('/test/project');
    });

    it('passes config to generator', () => {
      const prompt = getPromptForRole('product-manager', {
        projectPath: '/my/project',
        discordChannels: ['general', 'dev'],
      });
      expect(prompt).toContain('/my/project');
    });
  });

  describe('hasPrompt', () => {
    it('returns true for registered roles', () => {
      expect(hasPrompt('backend-engineer')).toBe(true);
      expect(hasPrompt('product-manager')).toBe(true);
    });

    it('returns false for unknown roles', () => {
      expect(hasPrompt('nonexistent')).toBe(false);
    });
  });

  describe('registerPrompt', () => {
    it('registers custom prompt generator', () => {
      registerPrompt('custom-role-test', () => 'Custom prompt output');

      expect(hasPrompt('custom-role-test')).toBe(true);
      const prompt = getPromptForRole('custom-role-test', { projectPath: '/test' });
      expect(prompt).toBe('Custom prompt output');
    });

    it('overrides existing registration', () => {
      registerPrompt('override-test', () => 'Original');
      registerPrompt('override-test', () => 'Overridden');

      const prompt = getPromptForRole('override-test', { projectPath: '/test' });
      expect(prompt).toBe('Overridden');
    });
  });

  describe('createPromptFromTemplate', () => {
    it('replaces {{projectPath}} placeholder', () => {
      const generator = createPromptFromTemplate('You work on {{projectPath}}. Do your best.');
      const prompt = generator({ projectPath: '/home/dev/myapp' });
      expect(prompt).toBe('You work on /home/dev/myapp. Do your best.');
    });

    it('replaces {{contextFiles}} placeholder', () => {
      const generator = createPromptFromTemplate('Context: {{contextFiles}}');
      const prompt = generator({
        projectPath: '/test',
        contextFiles: ['CLAUDE.md', 'rules.md'],
      });
      expect(prompt).toBe('Context: CLAUDE.md, rules.md');
    });

    it('handles missing contextFiles gracefully', () => {
      const generator = createPromptFromTemplate('Context: {{contextFiles}}');
      const prompt = generator({ projectPath: '/test' });
      expect(prompt).toBe('Context: ');
    });

    it('replaces multiple occurrences', () => {
      const generator = createPromptFromTemplate(
        '{{projectPath}} is great. Working on {{projectPath}}.'
      );
      const prompt = generator({ projectPath: '/app' });
      expect(prompt).toBe('/app is great. Working on /app.');
    });
  });

  describe('listRegisteredRoles', () => {
    it('returns array of strings', () => {
      const roles = listRegisteredRoles();
      expect(Array.isArray(roles)).toBe(true);
      roles.forEach((role) => {
        expect(typeof role).toBe('string');
      });
    });

    it('includes custom registered roles', () => {
      registerPrompt('list-test-role', () => 'test');
      expect(listRegisteredRoles()).toContain('list-test-role');
    });
  });
});
