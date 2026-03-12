import { describe, it, expect } from 'vitest';
import { PromptBuilder, SectionName } from '../src/prompt-builder.js';

describe('PromptBuilder', () => {
  describe('addSection / hasSection', () => {
    it('registers a section', () => {
      const builder = new PromptBuilder();
      builder.addSection(SectionName.TASK, 'Do the thing');
      expect(builder.hasSection(SectionName.TASK)).toBe(true);
    });

    it('returns false for unregistered sections', () => {
      const builder = new PromptBuilder();
      expect(builder.hasSection(SectionName.CONTEXT)).toBe(false);
    });

    it('supports chaining', () => {
      const builder = new PromptBuilder()
        .addSection(SectionName.TASK, 'Task content')
        .addSection(SectionName.CONTEXT, 'Context content');
      expect(builder.hasSection(SectionName.TASK)).toBe(true);
      expect(builder.hasSection(SectionName.CONTEXT)).toBe(true);
    });

    it('overwrites an existing section', () => {
      const builder = new PromptBuilder()
        .addSection(SectionName.TASK, 'Original')
        .addSection(SectionName.TASK, 'Updated');
      const output = builder.build();
      expect(output).toContain('Updated');
      expect(output).not.toContain('Original');
    });
  });

  describe('removeSection', () => {
    it('removes an existing section', () => {
      const builder = new PromptBuilder().addSection(SectionName.TASK, 'Do the thing');
      builder.removeSection(SectionName.TASK);
      expect(builder.hasSection(SectionName.TASK)).toBe(false);
    });

    it('is a no-op for non-existent sections', () => {
      const builder = new PromptBuilder();
      expect(() => builder.removeSection('nonexistent')).not.toThrow();
    });

    it('supports chaining', () => {
      const builder = new PromptBuilder()
        .addSection(SectionName.TASK, 'Task')
        .addSection(SectionName.CONTEXT, 'Context')
        .removeSection(SectionName.TASK);
      expect(builder.hasSection(SectionName.TASK)).toBe(false);
      expect(builder.hasSection(SectionName.CONTEXT)).toBe(true);
    });
  });

  describe('build() output format', () => {
    it('returns an empty string when no sections are added', () => {
      const builder = new PromptBuilder();
      expect(builder.build()).toBe('');
    });

    it('formats a single section as ## NAME\\n\\ncontent', () => {
      const output = new PromptBuilder().addSection(SectionName.TASK, 'Do something').build();
      expect(output).toBe('## TASK\n\nDo something');
    });

    it('joins multiple sections with \\n\\n---\\n\\n', () => {
      const output = new PromptBuilder()
        .addSection(SectionName.TASK, 'Task content')
        .addSection(SectionName.CONTEXT, 'Context content')
        .build();
      expect(output).toContain('\n\n---\n\n');
    });

    it('includes the section name as a heading', () => {
      const output = new PromptBuilder()
        .addSection(SectionName.CODING_STANDARDS, 'Follow style guide')
        .build();
      expect(output).toContain('## CODING_STANDARDS');
    });
  });

  describe('priority ordering', () => {
    it('sorts sections by priority ascending (lower = earlier)', () => {
      const output = new PromptBuilder()
        .addSection(SectionName.CONTEXT, 'Context content', { priority: 3 })
        .addSection(SectionName.TASK, 'Task content', { priority: 1 })
        .addSection(SectionName.ENVIRONMENT, 'Env content', { priority: 2 })
        .build();

      const taskPos = output.indexOf('## TASK');
      const envPos = output.indexOf('## ENVIRONMENT');
      const ctxPos = output.indexOf('## CONTEXT');

      expect(taskPos).toBeLessThan(envPos);
      expect(envPos).toBeLessThan(ctxPos);
    });

    it('treats sections without priority as priority 0', () => {
      const output = new PromptBuilder()
        .addSection(SectionName.CONTEXT, 'Context', { priority: 5 })
        .addSection(SectionName.TASK, 'Task') // no priority → 0
        .build();

      const taskPos = output.indexOf('## TASK');
      const ctxPos = output.indexOf('## CONTEXT');
      expect(taskPos).toBeLessThan(ctxPos);
    });

    it('preserves insertion order for equal-priority sections', () => {
      const output = new PromptBuilder()
        .addSection(SectionName.TASK, 'Task', { priority: 1 })
        .addSection(SectionName.CONTEXT, 'Context', { priority: 1 })
        .build();
      // Both have same priority; insertion order should be preserved
      const taskPos = output.indexOf('## TASK');
      const ctxPos = output.indexOf('## CONTEXT');
      expect(taskPos).toBeLessThan(ctxPos);
    });
  });

  describe('phase filtering', () => {
    it('includes sections with no phase filter regardless of current phase', () => {
      const output = new PromptBuilder()
        .setPhase('planning')
        .addSection(SectionName.TASK, 'Always shown')
        .build();
      expect(output).toContain('## TASK');
    });

    it('includes a section when its phase matches the current phase', () => {
      const output = new PromptBuilder()
        .setPhase('planning')
        .addSection(SectionName.CONTEXT, 'Planning context', { phase: 'planning' })
        .build();
      expect(output).toContain('## CONTEXT');
    });

    it('excludes a section when its phase does not match the current phase', () => {
      const output = new PromptBuilder()
        .setPhase('execution')
        .addSection(SectionName.CONTEXT, 'Planning-only content', { phase: 'planning' })
        .build();
      expect(output).not.toContain('## CONTEXT');
    });

    it('excludes a section with a phase filter when no phase is set on the builder', () => {
      const output = new PromptBuilder()
        .addSection(SectionName.CONTEXT, 'Phase-gated', { phase: 'planning' })
        .build();
      expect(output).not.toContain('## CONTEXT');
    });

    it('supports an array of phases', () => {
      const builderA = new PromptBuilder()
        .setPhase('planning')
        .addSection(SectionName.TASK, 'Multi-phase', { phase: ['planning', 'review'] });
      const builderB = new PromptBuilder()
        .setPhase('review')
        .addSection(SectionName.TASK, 'Multi-phase', { phase: ['planning', 'review'] });
      const builderC = new PromptBuilder()
        .setPhase('execution')
        .addSection(SectionName.TASK, 'Multi-phase', { phase: ['planning', 'review'] });

      expect(builderA.build()).toContain('## TASK');
      expect(builderB.build()).toContain('## TASK');
      expect(builderC.build()).not.toContain('## TASK');
    });
  });

  describe('conditional sections', () => {
    it('includes a section when conditional returns true', () => {
      const output = new PromptBuilder()
        .addSection(SectionName.TOOLS, 'Tool list', { conditional: () => true })
        .build();
      expect(output).toContain('## TOOLS');
    });

    it('excludes a section when conditional returns false', () => {
      const output = new PromptBuilder()
        .addSection(SectionName.TOOLS, 'Tool list', { conditional: () => false })
        .build();
      expect(output).not.toContain('## TOOLS');
    });

    it('evaluates the conditional at build time', () => {
      let include = false;
      const builder = new PromptBuilder().addSection(SectionName.TOOLS, 'Tool list', {
        conditional: () => include,
      });

      expect(builder.build()).not.toContain('## TOOLS');

      include = true;
      expect(builder.build()).toContain('## TOOLS');
    });
  });

  describe('setPhase', () => {
    it('supports chaining', () => {
      const builder = new PromptBuilder()
        .setPhase('planning')
        .addSection(SectionName.TASK, 'Do it');
      expect(builder.build()).toContain('## TASK');
    });
  });

  describe('SectionName enum', () => {
    it('exposes all 8 standard section names', () => {
      expect(SectionName.ENVIRONMENT).toBe('ENVIRONMENT');
      expect(SectionName.TASK).toBe('TASK');
      expect(SectionName.CONTEXT).toBe('CONTEXT');
      expect(SectionName.TOOLS).toBe('TOOLS');
      expect(SectionName.CODING_STANDARDS).toBe('CODING_STANDARDS');
      expect(SectionName.TESTING).toBe('TESTING');
      expect(SectionName.COMMIT_RULES).toBe('COMMIT_RULES');
      expect(SectionName.COMMUNICATION).toBe('COMMUNICATION');
    });
  });
});
