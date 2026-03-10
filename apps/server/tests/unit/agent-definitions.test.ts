import { describe, it, expect } from 'vitest';
import { createAvaAgent, createPMAgent, createLEAgent } from '@/services/agent-definitions.js';
import type { AgentDefinitionContext } from '@protolabsai/types';

const baseContext: AgentDefinitionContext = {
  projectPath: '/test/project',
};

describe('agent-definitions.ts', () => {
  // ─── createAvaAgent ────────────────────────────────────────────────────────

  describe('createAvaAgent', () => {
    it('returns a valid AgentDefinition shape', () => {
      const agent = createAvaAgent(baseContext);
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('prompt');
      expect(typeof agent.description).toBe('string');
      expect(typeof agent.prompt).toBe('string');
    });

    it('includes projectPath in the prompt', () => {
      const agent = createAvaAgent({ projectPath: '/my/project' });
      expect(agent.prompt).toContain('/my/project');
    });

    it('uses provided availableTools when given', () => {
      const tools = ['Read', 'Glob'];
      const agent = createAvaAgent({ ...baseContext, availableTools: tools });
      expect(agent.tools).toEqual(tools);
    });

    it('falls back to default tools when availableTools is omitted', () => {
      const agent = createAvaAgent(baseContext);
      expect(Array.isArray(agent.tools)).toBe(true);
      expect((agent.tools ?? []).length).toBeGreaterThan(0);
    });

    it('has non-empty description', () => {
      const agent = createAvaAgent(baseContext);
      expect(agent.description.trim().length).toBeGreaterThan(0);
    });

    it('has non-empty prompt', () => {
      const agent = createAvaAgent(baseContext);
      expect(agent.prompt.trim().length).toBeGreaterThan(0);
    });

    it('uses sonnet model alias', () => {
      const agent = createAvaAgent(baseContext);
      expect(agent.model).toBe('sonnet');
    });

    it('is pure — same context produces equal output', () => {
      const a = createAvaAgent(baseContext);
      const b = createAvaAgent(baseContext);
      expect(a).toEqual(b);
    });
  });

  // ─── createPMAgent ─────────────────────────────────────────────────────────

  describe('createPMAgent', () => {
    it('returns a valid AgentDefinition shape', () => {
      const agent = createPMAgent(baseContext);
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('prompt');
      expect(typeof agent.description).toBe('string');
      expect(typeof agent.prompt).toBe('string');
    });

    it('includes projectPath in the prompt', () => {
      const agent = createPMAgent({ projectPath: '/another/path' });
      expect(agent.prompt).toContain('/another/path');
    });

    it('uses provided availableTools when given', () => {
      const tools = ['Read', 'WebSearch'];
      const agent = createPMAgent({ ...baseContext, availableTools: tools });
      expect(agent.tools).toEqual(tools);
    });

    it('falls back to default tools when availableTools is omitted', () => {
      const agent = createPMAgent(baseContext);
      expect(Array.isArray(agent.tools)).toBe(true);
      expect((agent.tools ?? []).length).toBeGreaterThan(0);
    });

    it('has non-empty description', () => {
      const agent = createPMAgent(baseContext);
      expect(agent.description.trim().length).toBeGreaterThan(0);
    });

    it('has non-empty prompt', () => {
      const agent = createPMAgent(baseContext);
      expect(agent.prompt.trim().length).toBeGreaterThan(0);
    });

    it('uses sonnet model alias', () => {
      const agent = createPMAgent(baseContext);
      expect(agent.model).toBe('sonnet');
    });

    it('is pure — same context produces equal output', () => {
      const a = createPMAgent(baseContext);
      const b = createPMAgent(baseContext);
      expect(a).toEqual(b);
    });
  });

  // ─── createLEAgent ─────────────────────────────────────────────────────────

  describe('createLEAgent', () => {
    it('returns a valid AgentDefinition shape', () => {
      const agent = createLEAgent(baseContext);
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('prompt');
      expect(typeof agent.description).toBe('string');
      expect(typeof agent.prompt).toBe('string');
    });

    it('includes projectPath in the prompt', () => {
      const agent = createLEAgent({ projectPath: '/lead/eng/project' });
      expect(agent.prompt).toContain('/lead/eng/project');
    });

    it('uses provided availableTools when given', () => {
      const tools = ['Read', 'Write', 'Bash'];
      const agent = createLEAgent({ ...baseContext, availableTools: tools });
      expect(agent.tools).toEqual(tools);
    });

    it('falls back to default tools when availableTools is omitted', () => {
      const agent = createLEAgent(baseContext);
      expect(Array.isArray(agent.tools)).toBe(true);
      expect((agent.tools ?? []).length).toBeGreaterThan(0);
    });

    it('has non-empty description', () => {
      const agent = createLEAgent(baseContext);
      expect(agent.description.trim().length).toBeGreaterThan(0);
    });

    it('has non-empty prompt', () => {
      const agent = createLEAgent(baseContext);
      expect(agent.prompt.trim().length).toBeGreaterThan(0);
    });

    it('uses opus model alias', () => {
      const agent = createLEAgent(baseContext);
      expect(agent.model).toBe('opus');
    });

    it('is pure — same context produces equal output', () => {
      const a = createLEAgent(baseContext);
      const b = createLEAgent(baseContext);
      expect(a).toEqual(b);
    });

    it('includes Bash in default tools (LE has full access)', () => {
      const agent = createLEAgent(baseContext);
      expect(agent.tools).toContain('Bash');
    });
  });

  // ─── Model alias assignment ─────────────────────────────────────────────

  describe('model alias assignment', () => {
    it('Ava and PM both use sonnet', () => {
      const ava = createAvaAgent(baseContext);
      const pm = createPMAgent(baseContext);
      expect(ava.model).toBe('sonnet');
      expect(pm.model).toBe('sonnet');
    });

    it('LE uses opus (higher capability for implementation)', () => {
      const le = createLEAgent(baseContext);
      expect(le.model).toBe('opus');
    });

    it('all models are valid SDK alias values', () => {
      const validAliases = new Set(['sonnet', 'opus', 'haiku', 'inherit']);
      expect(validAliases.has(createAvaAgent(baseContext).model!)).toBe(true);
      expect(validAliases.has(createPMAgent(baseContext).model!)).toBe(true);
      expect(validAliases.has(createLEAgent(baseContext).model!)).toBe(true);
    });
  });

  // ─── Cross-factory checks ──────────────────────────────────────────────

  describe('all factories', () => {
    it('all three factories accept worldState without error', () => {
      const ctx: AgentDefinitionContext = {
        projectPath: '/proj',
        worldState: { activeProject: 'test', featureCount: 5 },
      };
      expect(() => createAvaAgent(ctx)).not.toThrow();
      expect(() => createPMAgent(ctx)).not.toThrow();
      expect(() => createLEAgent(ctx)).not.toThrow();
    });

    it('each agent has a distinct description', () => {
      const ava = createAvaAgent(baseContext);
      const pm = createPMAgent(baseContext);
      const le = createLEAgent(baseContext);
      const descriptions = new Set([ava.description, pm.description, le.description]);
      expect(descriptions.size).toBe(3);
    });

    it('each agent has a distinct prompt', () => {
      const ava = createAvaAgent(baseContext);
      const pm = createPMAgent(baseContext);
      const le = createLEAgent(baseContext);
      const prompts = new Set([ava.prompt, pm.prompt, le.prompt]);
      expect(prompts.size).toBe(3);
    });
  });
});
