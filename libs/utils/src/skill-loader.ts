/**
 * Skill List Loader
 *
 * Simple loader for the progressive skill system.
 * Scans .automaker/skills/{skill-name}/SKILL.md files and returns
 * a list of skill entries with basic metadata parsed from YAML frontmatter.
 */

import { readdir, readFile } from 'fs/promises';
import path from 'path';

/**
 * A single skill entry returned by loadSkillList
 */
export interface SkillEntry {
  /** Skill name from YAML frontmatter */
  name: string;
  /** Human-readable description from YAML frontmatter */
  description: string;
  /** Optional trigger keywords for automatic skill selection */
  triggers?: string[];
  /** Absolute path to the SKILL.md file */
  path: string;
}

/**
 * Parse simple YAML frontmatter from skill markdown content.
 * Extracts name, description, and triggers fields only.
 */
function parseFrontmatter(content: string): {
  name?: string;
  description?: string;
  triggers?: string[];
} | null {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result: { name?: string; description?: string; triggers?: string[] } = {};

  for (const line of yaml.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (!kv) continue;

    const key = kv[1];
    const value = kv[2].trim();

    if (key === 'name') {
      result.name = value.replace(/^["']|["']$/g, '');
    } else if (key === 'description') {
      result.description = value.replace(/^["']|["']$/g, '');
    } else if (key === 'triggers') {
      if (value.startsWith('[') && value.endsWith(']')) {
        result.triggers = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
    }
  }

  return result;
}

/**
 * Load the list of skills from .automaker/skills/{skill-name}/SKILL.md files.
 * Returns an empty array if the skills directory does not exist or has no valid skills.
 */
export async function loadSkillList(projectPath: string): Promise<SkillEntry[]> {
  const skillsDir = path.join(projectPath, '.automaker', 'skills');
  const entries: SkillEntry[] = [];

  let names: string[];
  try {
    names = await readdir(skillsDir);
  } catch {
    return [];
  }

  for (const name of names) {
    const skillFilePath = path.join(skillsDir, name, 'SKILL.md');

    try {
      const content = await readFile(skillFilePath, 'utf-8');
      const parsed = parseFrontmatter(content);

      if (parsed?.name) {
        entries.push({
          name: parsed.name,
          description: parsed.description ?? '',
          triggers: parsed.triggers,
          path: skillFilePath,
        });
      }
    } catch {
      // Skip entries without a valid SKILL.md (plain files, empty dirs, etc.)
    }
  }

  return entries;
}
