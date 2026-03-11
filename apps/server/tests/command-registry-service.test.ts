/**
 * Unit tests for CommandRegistryService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommandRegistryService } from '../src/services/command-registry-service.js';

// Helper to create a temp directory structure
function createTempRepo(): string {
  const repoRoot = join(tmpdir(), `cmd-registry-test-${Date.now()}`);
  mkdirSync(repoRoot, { recursive: true });
  return repoRoot;
}

function writeCommandFile(dir: string, filename: string, content: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), content, 'utf-8');
}

describe('CommandRegistryService', () => {
  let repoRoot: string;
  let service: CommandRegistryService;

  beforeEach(() => {
    repoRoot = createTempRepo();
    service = new CommandRegistryService(repoRoot);
  });

  afterEach(() => {
    service.destroy();
    rmSync(repoRoot, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Built-in commands
  // -------------------------------------------------------------------------

  describe('built-in commands', () => {
    it('registers compact, clear, and new without filesystem', () => {
      service.initialize();
      const all = service.getAll();
      const names = all.map((c) => c.name);
      expect(names).toContain('compact');
      expect(names).toContain('clear');
      expect(names).toContain('new');
    });

    it('marks built-ins with source=built-in', () => {
      service.initialize();
      const compact = service.get('compact');
      expect(compact?.source).toBe('built-in');
    });

    it('built-in commands have no body', () => {
      service.initialize();
      expect(service.get('compact')?.body).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // MCP plugin commands
  // -------------------------------------------------------------------------

  describe('MCP plugin commands', () => {
    it('discovers commands from packages/mcp-server/plugins/automaker/commands/', () => {
      const cmdDir = join(repoRoot, 'packages/mcp-server/plugins/automaker/commands');
      writeCommandFile(
        cmdDir,
        'ava.md',
        `---
name: ava
description: Activates AVA
argument-hint: [project-path]
allowed-tools:
  - Read
  - Glob
model: claude-opus-4-6
---

# Ava skill body
`
      );

      service.initialize();

      const cmd = service.get('ava');
      expect(cmd).toBeDefined();
      expect(cmd?.source).toBe('mcp-plugin');
      expect(cmd?.description).toBe('Activates AVA');
      expect(cmd?.argumentHint).toBe('[project-path]');
      expect(cmd?.allowedTools).toEqual(['Read', 'Glob']);
      expect(cmd?.model).toBe('claude-opus-4-6');
      expect(cmd?.body).toContain('Ava skill body');
    });

    it('falls back to filename when name is missing from frontmatter', () => {
      const cmdDir = join(repoRoot, 'packages/mcp-server/plugins/automaker/commands');
      writeCommandFile(
        cmdDir,
        'my-tool.md',
        `---
description: A tool without a name field
---
body here
`
      );

      service.initialize();
      const cmd = service.get('my-tool');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('my-tool');
    });

    it('skips non-.md files', () => {
      const cmdDir = join(repoRoot, 'packages/mcp-server/plugins/automaker/commands');
      writeCommandFile(cmdDir, 'ignored.txt', 'not a command');
      service.initialize();
      expect(service.get('ignored')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Learned skills
  // -------------------------------------------------------------------------

  describe('learned skills', () => {
    it('discovers commands from .automaker/skills/', () => {
      const skillDir = join(repoRoot, '.automaker/skills');
      writeCommandFile(
        skillDir,
        'commit.md',
        `---
name: commit
description: Create a git commit
---
Commit skill body
`
      );

      service.initialize();

      const cmd = service.get('commit');
      expect(cmd).toBeDefined();
      expect(cmd?.source).toBe('learned-skill');
      expect(cmd?.description).toBe('Create a git commit');
    });
  });

  // -------------------------------------------------------------------------
  // Project skills
  // -------------------------------------------------------------------------

  describe('project skills', () => {
    it('discovers commands from .claude/skills/', () => {
      const skillDir = join(repoRoot, '.claude/skills');
      writeCommandFile(
        skillDir,
        'review-pr.md',
        `---
name: review-pr
description: Review a pull request
---
Review body
`
      );

      service.initialize();

      const cmd = service.get('review-pr');
      expect(cmd).toBeDefined();
      expect(cmd?.source).toBe('project-skill');
    });
  });

  // -------------------------------------------------------------------------
  // Missing directories
  // -------------------------------------------------------------------------

  describe('missing directories', () => {
    it('initializes successfully when all skill directories are absent', () => {
      // Only built-ins should be registered
      service.initialize();
      const all = service.getAll();
      expect(all.length).toBe(3); // compact, clear, new
    });
  });

  // -------------------------------------------------------------------------
  // Frontmatter parsing
  // -------------------------------------------------------------------------

  describe('frontmatter parsing', () => {
    it('parses allowed-tools sequence with inline comments', () => {
      const cmdDir = join(repoRoot, 'packages/mcp-server/plugins/automaker/commands');
      writeCommandFile(
        cmdDir,
        'complex.md',
        `---
name: complex
description: Complex command
allowed-tools:
  - Read  # read files
  - Glob  # glob patterns
  - Bash  # execute commands
---
body
`
      );

      service.initialize();
      const cmd = service.get('complex');
      expect(cmd?.allowedTools).toEqual(['Read', 'Glob', 'Bash']);
    });

    it('handles file without frontmatter', () => {
      const cmdDir = join(repoRoot, 'packages/mcp-server/plugins/automaker/commands');
      writeCommandFile(cmdDir, 'bare.md', '# Just a markdown file\nno frontmatter here');

      service.initialize();
      const cmd = service.get('bare');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('bare');
    });
  });
});
