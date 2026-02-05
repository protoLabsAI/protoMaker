/**
 * Verification test for Skill types
 * Tests that the Skill interface and related types are properly defined and exported
 */
import { describe, it, expect } from 'vitest';
import type {
  Skill,
  SkillRequirements,
  SkillMetadata,
  SkillFrontmatter,
  CreateSkillOptions,
  UpdateSkillOptions,
  SkillExecutionResult,
} from '@automaker/types';

describe('Skill types', () => {
  describe('Skill interface', () => {
    it('should allow creating a valid Skill object', () => {
      const skill: Skill = {
        name: 'commit',
        emoji: '📝',
        description: 'Create a git commit with a descriptive message',
        requires: {
          bins: ['git'],
          files: ['.git'],
          env: [],
        },
        content: '# Commit Skill\n\nYour task is to create a git commit...',
        metadata: {
          author: 'automaker',
          created: '2026-01-15T00:00:00Z',
          usageCount: 42,
          successRate: 0.95,
        },
      };

      expect(skill.name).toBe('commit');
      expect(skill.emoji).toBe('📝');
      expect(skill.description).toBe('Create a git commit with a descriptive message');
      expect(skill.requires?.bins).toEqual(['git']);
      expect(skill.metadata.usageCount).toBe(42);
      expect(skill.metadata.successRate).toBe(0.95);
    });

    it('should allow creating a minimal Skill object without optional fields', () => {
      const skill: Skill = {
        name: 'simple-skill',
        description: 'A simple skill',
        content: 'Do something simple',
        metadata: {
          created: '2026-01-15T00:00:00Z',
          usageCount: 0,
          successRate: 1.0,
        },
      };

      expect(skill.name).toBe('simple-skill');
      expect(skill.emoji).toBeUndefined();
      expect(skill.requires).toBeUndefined();
    });
  });

  describe('SkillRequirements interface', () => {
    it('should support all requirement types', () => {
      const requirements: SkillRequirements = {
        bins: ['node', 'npm', 'git'],
        files: ['package.json', 'tsconfig.json'],
        env: ['ANTHROPIC_API_KEY', 'NODE_ENV'],
      };

      expect(requirements.bins).toHaveLength(3);
      expect(requirements.files).toHaveLength(2);
      expect(requirements.env).toHaveLength(2);
    });

    it('should allow empty requirements', () => {
      const requirements: SkillRequirements = {};

      expect(requirements.bins).toBeUndefined();
      expect(requirements.files).toBeUndefined();
      expect(requirements.env).toBeUndefined();
    });
  });

  describe('SkillMetadata interface', () => {
    it('should track usage statistics', () => {
      const metadata: SkillMetadata = {
        author: 'test-author',
        created: '2026-01-01T00:00:00Z',
        updated: '2026-01-15T00:00:00Z',
        usageCount: 100,
        successRate: 0.87,
        version: '1.2.0',
        tags: ['git', 'commit', 'productivity'],
        source: 'learned',
      };

      expect(metadata.author).toBe('test-author');
      expect(metadata.usageCount).toBe(100);
      expect(metadata.successRate).toBe(0.87);
      expect(metadata.source).toBe('learned');
      expect(metadata.tags).toEqual(['git', 'commit', 'productivity']);
    });

    it('should support all source types', () => {
      const learnedMeta: SkillMetadata = {
        created: '2026-01-01T00:00:00Z',
        usageCount: 0,
        successRate: 0,
        source: 'learned',
      };
      const importedMeta: SkillMetadata = {
        created: '2026-01-01T00:00:00Z',
        usageCount: 0,
        successRate: 0,
        source: 'imported',
      };
      const builtInMeta: SkillMetadata = {
        created: '2026-01-01T00:00:00Z',
        usageCount: 0,
        successRate: 0,
        source: 'built-in',
      };

      expect(learnedMeta.source).toBe('learned');
      expect(importedMeta.source).toBe('imported');
      expect(builtInMeta.source).toBe('built-in');
    });
  });

  describe('SkillFrontmatter interface', () => {
    it('should represent YAML frontmatter structure', () => {
      const frontmatter: SkillFrontmatter = {
        name: 'test-skill',
        emoji: '🧪',
        description: 'A test skill',
        requires: {
          bins: ['node'],
        },
        metadata: {
          author: 'test',
          usageCount: 5,
        },
      };

      expect(frontmatter.name).toBe('test-skill');
      expect(frontmatter.metadata?.author).toBe('test');
    });
  });

  describe('CreateSkillOptions interface', () => {
    it('should support all creation options', () => {
      const options: CreateSkillOptions = {
        name: 'new-skill',
        emoji: '✨',
        description: 'A brand new skill',
        content: 'Skill instructions here',
        requires: {
          bins: ['npm'],
        },
        author: 'creator',
        tags: ['new', 'example'],
        source: 'imported',
      };

      expect(options.name).toBe('new-skill');
      expect(options.author).toBe('creator');
      expect(options.source).toBe('imported');
    });
  });

  describe('UpdateSkillOptions interface', () => {
    it('should allow partial updates', () => {
      const update: UpdateSkillOptions = {
        description: 'Updated description',
        tags: ['updated'],
      };

      expect(update.description).toBe('Updated description');
      expect(update.emoji).toBeUndefined();
      expect(update.content).toBeUndefined();
    });
  });

  describe('SkillExecutionResult interface', () => {
    it('should represent successful execution', () => {
      const result: SkillExecutionResult = {
        success: true,
        output: 'Skill completed successfully',
        durationMs: 1500,
      };

      expect(result.success).toBe(true);
      expect(result.output).toBe('Skill completed successfully');
      expect(result.error).toBeUndefined();
    });

    it('should represent failed execution', () => {
      const result: SkillExecutionResult = {
        success: false,
        error: 'Required binary not found: git',
        durationMs: 50,
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Required binary not found: git');
    });
  });
});
