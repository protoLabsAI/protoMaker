/**
 * Skills Loader Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSkillsDir,
  parseSkillFrontmatter,
  serializeSkill,
  checkRequirements,
  listSkills,
  getSkill,
  loadRelevantSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  recordSkillUsage,
  type SkillsFsModule,
} from '@protolabs-ai/utils';
import type { Skill, CreateSkillOptions } from '@protolabs-ai/types';

// Mock file system
function createMockFs(files: Record<string, string> = {}): SkillsFsModule {
  const fileSystem = { ...files };

  return {
    readFile: vi.fn(async (path: string) => {
      if (fileSystem[path]) return fileSystem[path];
      throw new Error(`ENOENT: ${path}`);
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      fileSystem[path] = content;
    }),
    readdir: vi.fn(async (dirPath: string) => {
      const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
      const entries = new Set<string>();
      for (const path of Object.keys(fileSystem)) {
        if (path.startsWith(prefix)) {
          const relative = path.slice(prefix.length);
          const firstPart = relative.split('/')[0];
          if (firstPart) entries.add(firstPart);
        }
      }
      return Array.from(entries);
    }),
    stat: vi.fn(async (path: string) => {
      if (fileSystem[path]) return { isFile: () => true };
      throw new Error(`ENOENT: ${path}`);
    }),
    mkdir: vi.fn(async () => {}),
    unlink: vi.fn(async (path: string) => {
      if (fileSystem[path]) {
        delete fileSystem[path];
      } else {
        throw new Error(`ENOENT: ${path}`);
      }
    }),
    access: vi.fn(async (path: string) => {
      if (!fileSystem[path]) throw new Error(`ENOENT: ${path}`);
    }),
  };
}

describe('getSkillsDir', () => {
  it('returns correct skills directory path', () => {
    expect(getSkillsDir('/project')).toBe('/project/.automaker/skills');
    expect(getSkillsDir('/home/user/myproject')).toBe('/home/user/myproject/.automaker/skills');
  });
});

describe('parseSkillFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const content = `---
name: test-skill
emoji: 🧪
description: A test skill
requires:
  bins: [git, npm]
  files: [package.json]
  env: [API_KEY]
metadata:
  author: tester
  created: 2026-01-01T00:00:00Z
  usageCount: 10
  successRate: 0.9
  tags: [test, example]
  source: learned
---

# Test Skill

This is the skill content.
`;

    const { frontmatter, body } = parseSkillFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter?.name).toBe('test-skill');
    expect(frontmatter?.emoji).toBe('🧪');
    expect(frontmatter?.description).toBe('A test skill');
    expect(frontmatter?.requires?.bins).toEqual(['git', 'npm']);
    expect(frontmatter?.requires?.files).toEqual(['package.json']);
    expect(frontmatter?.requires?.env).toEqual(['API_KEY']);
    expect(frontmatter?.metadata?.author).toBe('tester');
    expect(frontmatter?.metadata?.usageCount).toBe(10);
    expect(frontmatter?.metadata?.successRate).toBe(0.9);
    expect(frontmatter?.metadata?.tags).toEqual(['test', 'example']);
    expect(frontmatter?.metadata?.source).toBe('learned');
    expect(body).toBe('# Test Skill\n\nThis is the skill content.');
  });

  it('returns null frontmatter for content without frontmatter', () => {
    const content = '# Just Content\n\nNo frontmatter here.';
    const { frontmatter, body } = parseSkillFrontmatter(content);

    expect(frontmatter).toBeNull();
    expect(body).toBe(content);
  });

  it('handles empty arrays', () => {
    const content = `---
name: minimal
description: Minimal skill
requires:
  bins: []
metadata:
  created: 2026-01-01T00:00:00Z
  usageCount: 0
  successRate: 0
---

Content`;

    const { frontmatter } = parseSkillFrontmatter(content);
    expect(frontmatter?.requires?.bins).toEqual([]);
  });
});

describe('serializeSkill', () => {
  it('serializes skill to markdown with frontmatter', () => {
    const skill: Skill = {
      name: 'my-skill',
      emoji: '🚀',
      description: 'A great skill',
      requires: {
        bins: ['node'],
        files: ['package.json'],
      },
      content: '# My Skill\n\nDo the thing.',
      metadata: {
        author: 'dev',
        created: '2026-01-01T00:00:00Z',
        usageCount: 5,
        successRate: 0.8,
        tags: ['useful'],
        source: 'learned',
      },
    };

    const serialized = serializeSkill(skill);

    expect(serialized).toContain('name: my-skill');
    expect(serialized).toContain('emoji: 🚀');
    expect(serialized).toContain('description: A great skill');
    expect(serialized).toContain('bins: [node]');
    expect(serialized).toContain('files: [package.json]');
    expect(serialized).toContain('author: dev');
    expect(serialized).toContain('usageCount: 5');
    expect(serialized).toContain('successRate: 0.8');
    expect(serialized).toContain('tags: [useful]');
    expect(serialized).toContain('source: learned');
    expect(serialized).toContain('# My Skill');
  });

  it('omits optional fields when not present', () => {
    const skill: Skill = {
      name: 'minimal',
      description: 'Minimal skill',
      content: 'Content',
      metadata: {
        created: '2026-01-01T00:00:00Z',
        usageCount: 0,
        successRate: 0,
      },
    };

    const serialized = serializeSkill(skill);

    expect(serialized).toContain('name: minimal');
    expect(serialized).not.toContain('emoji:');
    expect(serialized).not.toContain('requires:');
    expect(serialized).not.toContain('tags:');
  });
});

describe('checkRequirements', () => {
  it('returns satisfied when no requirements', async () => {
    const fs = createMockFs();
    const result = await checkRequirements(undefined, '/project', fs);
    expect(result.satisfied).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('checks file requirements', async () => {
    const fs = createMockFs({
      '/project/package.json': '{}',
    });

    const result = await checkRequirements(
      { files: ['package.json', 'missing.txt'] },
      '/project',
      fs
    );

    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('file:missing.txt');
    expect(result.missing).not.toContain('file:package.json');
  });

  it('checks env requirements', async () => {
    const fs = createMockFs();
    const originalEnv = process.env.TEST_VAR;
    process.env.TEST_VAR = 'value';

    const result = await checkRequirements({ env: ['TEST_VAR', 'MISSING_VAR'] }, '/project', fs);

    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('env:MISSING_VAR');
    expect(result.missing).not.toContain('env:TEST_VAR');

    // Cleanup
    if (originalEnv === undefined) {
      delete process.env.TEST_VAR;
    } else {
      process.env.TEST_VAR = originalEnv;
    }
  });
});

describe('createSkill', () => {
  it('creates a new skill file', async () => {
    const fs = createMockFs();

    const options: CreateSkillOptions = {
      name: 'new-skill',
      emoji: '✨',
      description: 'A brand new skill',
      content: '# New Skill\n\nInstructions here.',
      author: 'tester',
      tags: ['new'],
      source: 'learned',
    };

    const skill = await createSkill('/project', options, fs);

    expect(skill.name).toBe('new-skill');
    expect(skill.emoji).toBe('✨');
    expect(skill.description).toBe('A brand new skill');
    expect(skill.metadata.author).toBe('tester');
    expect(skill.metadata.tags).toEqual(['new']);
    expect(fs.writeFile).toHaveBeenCalled();
  });
});

describe('listSkills', () => {
  it('lists all skills in directory', async () => {
    const skillContent = `---
name: skill-one
description: First skill
metadata:
  created: 2026-01-01T00:00:00Z
  usageCount: 0
  successRate: 0
---

Content`;

    const fs = createMockFs({
      '/project/.automaker/skills/skill-one.md': skillContent,
      '/project/.automaker/skills/not-a-skill.txt': 'ignored',
    });

    const skills = await listSkills('/project', fs);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('skill-one');
  });

  it('returns empty array when no skills', async () => {
    const fs = createMockFs();
    const skills = await listSkills('/project', fs);
    expect(skills).toEqual([]);
  });
});

describe('getSkill', () => {
  it('gets a specific skill by name', async () => {
    const skillContent = `---
name: target-skill
description: The target
metadata:
  created: 2026-01-01T00:00:00Z
  usageCount: 5
  successRate: 0.8
---

Target content`;

    const fs = createMockFs({
      '/project/.automaker/skills/target-skill.md': skillContent,
    });

    const skill = await getSkill('/project', 'target-skill', fs);

    expect(skill).not.toBeNull();
    expect(skill?.name).toBe('target-skill');
    expect(skill?.metadata.usageCount).toBe(5);
  });

  it('returns null for non-existent skill', async () => {
    const fs = createMockFs();
    const skill = await getSkill('/project', 'missing', fs);
    expect(skill).toBeNull();
  });
});

describe('loadRelevantSkills', () => {
  it('loads skills relevant to context', async () => {
    const skill1 = `---
name: git-skill
description: Git operations
metadata:
  created: 2026-01-01T00:00:00Z
  usageCount: 10
  successRate: 0.9
  tags: [git, version-control]
---

Git content`;

    const skill2 = `---
name: test-skill
description: Testing utilities
metadata:
  created: 2026-01-01T00:00:00Z
  usageCount: 5
  successRate: 0.7
  tags: [testing, jest]
---

Test content`;

    const fs = createMockFs({
      '/project/.automaker/skills/git-skill.md': skill1,
      '/project/.automaker/skills/test-skill.md': skill2,
    });

    const result = await loadRelevantSkills(
      '/project',
      { tags: ['git'], featureTitle: 'Add git commit feature' },
      fs
    );

    expect(result.skills.length).toBeGreaterThan(0);
    // Git skill should be ranked higher due to tag match
    expect(result.skills[0].name).toBe('git-skill');
    expect(result.formattedPrompt).toContain('Available Skills');
  });

  it('returns empty when no skills exist', async () => {
    const fs = createMockFs();
    const result = await loadRelevantSkills('/project', {}, fs);

    expect(result.skills).toEqual([]);
    expect(result.totalLoaded).toBe(0);
    expect(result.formattedPrompt).toBe('');
  });
});

describe('updateSkill', () => {
  it('updates an existing skill', async () => {
    const originalContent = `---
name: updatable
description: Original description
metadata:
  created: 2026-01-01T00:00:00Z
  usageCount: 0
  successRate: 0
---

Original content`;

    const fs = createMockFs({
      '/project/.automaker/skills/updatable.md': originalContent,
    });

    const updated = await updateSkill(
      '/project',
      'updatable',
      { description: 'Updated description', content: 'Updated content' },
      fs
    );

    expect(updated).not.toBeNull();
    expect(updated?.description).toBe('Updated description');
    expect(updated?.content).toBe('Updated content');
    expect(updated?.metadata.updated).toBeDefined();
  });

  it('returns null for non-existent skill', async () => {
    const fs = createMockFs();
    const result = await updateSkill('/project', 'missing', { description: 'test' }, fs);
    expect(result).toBeNull();
  });
});

describe('deleteSkill', () => {
  it('deletes an existing skill', async () => {
    const fs = createMockFs({
      '/project/.automaker/skills/to-delete.md': 'content',
    });

    const result = await deleteSkill('/project', 'to-delete', fs);

    expect(result).toBe(true);
    expect(fs.unlink).toHaveBeenCalledWith('/project/.automaker/skills/to-delete.md');
  });

  it('returns false for non-existent skill', async () => {
    const fs = createMockFs();
    const result = await deleteSkill('/project', 'missing', fs);
    expect(result).toBe(false);
  });
});

describe('recordSkillUsage', () => {
  it('updates usage statistics on success', async () => {
    const skillContent = `---
name: tracked
description: Tracked skill
metadata:
  created: 2026-01-01T00:00:00Z
  usageCount: 10
  successRate: 0.8
---

Content`;

    const fs = createMockFs({
      '/project/.automaker/skills/tracked.md': skillContent,
    });

    await recordSkillUsage('/project', 'tracked', true, fs);

    // Verify writeFile was called with updated stats
    expect(fs.writeFile).toHaveBeenCalled();
    const writeCall = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
    const writtenContent = writeCall[1] as string;

    expect(writtenContent).toContain('usageCount: 11');
    // New success rate: (10 * 0.8 + 1) / 11 = 9 / 11 ≈ 0.818
    expect(writtenContent).toMatch(/successRate: 0\.8\d+/);
  });

  it('updates usage statistics on failure', async () => {
    const skillContent = `---
name: tracked
description: Tracked skill
metadata:
  created: 2026-01-01T00:00:00Z
  usageCount: 10
  successRate: 0.8
---

Content`;

    const fs = createMockFs({
      '/project/.automaker/skills/tracked.md': skillContent,
    });

    await recordSkillUsage('/project', 'tracked', false, fs);

    const writeCall = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
    const writtenContent = writeCall[1] as string;

    expect(writtenContent).toContain('usageCount: 11');
    // New success rate: (10 * 0.8 + 0) / 11 = 8 / 11 ≈ 0.727
    expect(writtenContent).toMatch(/successRate: 0\.7\d+/);
  });
});
