/**
 * Unit tests for Ava chat context loading
 *
 * Verifies that Ava loads the project root CLAUDE.md and the Ava skill prompt
 * (with frontmatter stripped) — NOT .automaker/context/ or .automaker/memory/
 * which are reserved for dev agents.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// Mock fs/promises before importing the module under test
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

import fs from 'fs/promises';
import { loadAvaContext, stripFrontmatter } from '@/routes/chat/index.js';

const PROJECT_PATH = '/fake/project';
const CLAUDE_MD_PATH = path.join(PROJECT_PATH, 'CLAUDE.md');
const AVA_SKILL_PATH = path.resolve(
  PROJECT_PATH,
  'packages/mcp-server/plugins/automaker/commands/ava.md'
);

// The UI prompt path is resolved using import.meta.url relative to the compiled module.
// In tests it resolves from the source tree: src/routes/chat/ava-prompt.md
const AVA_UI_PROMPT_FILENAME = 'ava-prompt.md';

describe('loadAvaContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads CLAUDE.md from project root', async () => {
    const claudeContent = '# My Project\n\nSome instructions here.';
    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (filePath === CLAUDE_MD_PATH) return claudeContent;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await loadAvaContext(PROJECT_PATH);

    expect(result).toContain('# Project Instructions (CLAUDE.md)');
    expect(result).toContain('Some instructions here.');
  });

  it('loads Ava skill prompt with frontmatter stripped', async () => {
    const avaSkillContent = [
      '---',
      'name: ava',
      'description: The Ava skill',
      '---',
      '',
      '# AVA Prompt',
      '',
      'You are AVA, the orchestrator.',
    ].join('\n');

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (filePath === AVA_SKILL_PATH) return avaSkillContent;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await loadAvaContext(PROJECT_PATH);

    expect(result).toContain('# AVA Prompt');
    expect(result).toContain('You are AVA, the orchestrator.');
    // Frontmatter must be stripped
    expect(result).not.toContain('name: ava');
    expect(result).not.toContain('description: The Ava skill');
  });

  it('combines both sources with separator', async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (filePath === CLAUDE_MD_PATH) return 'Project rules here.';
      if (filePath === AVA_SKILL_PATH) return '---\nname: ava\n---\n\nAva body content.';
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await loadAvaContext(PROJECT_PATH);

    expect(result).toContain('Project rules here.');
    expect(result).toContain('Ava body content.');
    // Should have a separator between the two sections
    expect(result).toContain('\n\n---\n\n');
  });

  it('returns undefined when neither file exists', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );

    const result = await loadAvaContext(PROJECT_PATH);

    expect(result).toBeUndefined();
  });

  it('returns only CLAUDE.md when ava skill file is missing', async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (filePath === CLAUDE_MD_PATH) return 'Only CLAUDE.md exists.';
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await loadAvaContext(PROJECT_PATH);

    expect(result).toContain('Only CLAUDE.md exists.');
    // Should not have the separator since there's only one part
    expect(result).not.toContain('\n\n---\n\n');
  });

  it('returns only ava skill when CLAUDE.md is missing', async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (filePath === AVA_SKILL_PATH) return '---\nname: ava\n---\n\nAva only.';
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await loadAvaContext(PROJECT_PATH);

    expect(result).toContain('Ava only.');
    expect(result).not.toContain('CLAUDE.md');
  });

  it('skips empty CLAUDE.md', async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (filePath === CLAUDE_MD_PATH) return '   \n  \n  ';
      if (filePath === AVA_SKILL_PATH) return '---\nname: ava\n---\n\nAva content.';
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await loadAvaContext(PROJECT_PATH);

    expect(result).not.toContain('Project Instructions');
    expect(result).toContain('Ava content.');
  });

  it('does NOT load .automaker/context/ files', async () => {
    const readFileCalls: string[] = [];
    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      readFileCalls.push(filePath);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    await loadAvaContext(PROJECT_PATH);

    // Should attempt: CLAUDE.md, ava-prompt.md (UI prompt), CLI skill fallback
    // Total: 3 paths when both prompt files are missing
    expect(readFileCalls.length).toBeGreaterThanOrEqual(2);
    expect(readFileCalls[0]).toBe(CLAUDE_MD_PATH);
    // Second path is the UI-specific ava-prompt.md
    expect(readFileCalls[1]).toContain(AVA_UI_PROMPT_FILENAME);
    // Third path (fallback) is the CLI skill file
    expect(readFileCalls[2]).toBe(AVA_SKILL_PATH);
    // Must never touch .automaker/context/ or .automaker/memory/
    for (const call of readFileCalls) {
      expect(call).not.toContain('.automaker/context');
      expect(call).not.toContain('.automaker/memory');
    }
  });
});

describe('stripFrontmatter', () => {
  it('strips YAML frontmatter delimited by ---', () => {
    const input = '---\nname: test\ndescription: foo\n---\n\n# Body\n\nContent here.';
    expect(stripFrontmatter(input)).toBe('# Body\n\nContent here.');
  });

  it('returns full content when no frontmatter present', () => {
    const input = '# No Frontmatter\n\nJust content.';
    expect(stripFrontmatter(input)).toBe('# No Frontmatter\n\nJust content.');
  });

  it('handles frontmatter with no body after it', () => {
    const input = '---\nname: test\n---';
    expect(stripFrontmatter(input)).toBe('');
  });

  it('handles frontmatter with only whitespace body', () => {
    const input = '---\nname: test\n---\n\n   \n';
    expect(stripFrontmatter(input)).toBe('');
  });

  it('preserves --- within body content (not frontmatter)', () => {
    const input = '---\nname: test\n---\n\n# Title\n\nSome text\n\n---\n\nMore text after rule.';
    const result = stripFrontmatter(input);
    expect(result).toContain('# Title');
    expect(result).toContain('More text after rule.');
  });
});
