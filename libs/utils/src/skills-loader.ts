/**
 * Skills Loader
 *
 * Manages loading, creating, and tracking reusable skills for AI agents.
 * Skills are stored as markdown files with YAML frontmatter in .automaker/skills/
 */

import * as path from 'path';
import type {
  Skill,
  SkillFrontmatter,
  SkillMetadata,
  SkillRequirements,
  CreateSkillOptions,
  UpdateSkillOptions,
} from '@protolabs-ai/types';

/**
 * File system module interface for dependency injection
 */
export interface SkillsFsModule {
  readFile: (path: string, encoding: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  stat: (path: string) => Promise<{ isFile: () => boolean }>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  access: (path: string) => Promise<void>;
}

/**
 * Result of loading relevant skills
 */
export interface SkillsLoadResult {
  skills: Skill[];
  formattedPrompt: string;
  totalLoaded: number;
}

/**
 * Get the skills directory path for a project
 */
export function getSkillsDir(projectPath: string): string {
  return path.join(projectPath, '.automaker', 'skills');
}

/**
 * Create default metadata for a new skill
 */
function createDefaultMetadata(
  author?: string,
  source?: 'learned' | 'imported' | 'built-in'
): SkillMetadata {
  return {
    author: author || 'agent',
    created: new Date().toISOString(),
    usageCount: 0,
    successRate: 0,
    source: source || 'learned',
  };
}

/**
 * Escape a string for safe YAML output
 */
function escapeYamlString(str: string): string {
  if (typeof str !== 'string') return String(str);
  if (/[:\[\]{}#&*!|>'"%@`\n\r]/.test(str) || str.trim() !== str) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

/**
 * Parse YAML frontmatter from skill markdown content
 */
export function parseSkillFrontmatter(content: string): {
  frontmatter: SkillFrontmatter | null;
  body: string;
} {
  const frontmatterRegex = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: null, body: content };
  }

  const yamlContent = match[1];
  const body = content.slice(match[0].length).trim();

  try {
    // Simple YAML parser for skill frontmatter
    const frontmatter: SkillFrontmatter = {
      name: '',
      description: '',
    };

    const lines = yamlContent.split(/\r?\n/);
    let currentKey: string | null = null;
    let currentIndent = 0;
    let inRequires = false;
    let inMetadata = false;
    const requires: SkillRequirements = {};
    const metadata: Partial<SkillMetadata> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = line.search(/\S/);

      // Check for top-level keys
      const keyMatch = trimmed.match(/^([a-zA-Z_]+):\s*(.*)$/);
      if (keyMatch && indent === 0) {
        currentKey = keyMatch[1];
        const value = keyMatch[2].trim();
        currentIndent = indent;
        inRequires = currentKey === 'requires';
        inMetadata = currentKey === 'metadata';

        if (!inRequires && !inMetadata && value) {
          // Simple value
          const parsedValue = parseYamlValue(value);
          if (currentKey === 'name') frontmatter.name = String(parsedValue);
          else if (currentKey === 'emoji') frontmatter.emoji = String(parsedValue);
          else if (currentKey === 'description') frontmatter.description = String(parsedValue);
        }
        continue;
      }

      // Handle nested keys in requires
      if (inRequires && indent > 0) {
        const nestedMatch = trimmed.match(/^([a-zA-Z_]+):\s*(.*)$/);
        if (nestedMatch) {
          const nestedKey = nestedMatch[1] as keyof SkillRequirements;
          const nestedValue = nestedMatch[2].trim();
          if (nestedValue) {
            const parsed = parseYamlValue(nestedValue);
            if (Array.isArray(parsed)) {
              requires[nestedKey] = parsed as string[];
            }
          }
        }
      }

      // Handle nested keys in metadata
      if (inMetadata && indent > 0) {
        const nestedMatch = trimmed.match(/^([a-zA-Z_]+):\s*(.*)$/);
        if (nestedMatch) {
          const nestedKey = nestedMatch[1];
          const nestedValue = nestedMatch[2].trim();
          if (nestedValue) {
            const parsed = parseYamlValue(nestedValue);
            if (nestedKey === 'author') metadata.author = String(parsed);
            else if (nestedKey === 'created') metadata.created = String(parsed);
            else if (nestedKey === 'updated') metadata.updated = String(parsed);
            else if (nestedKey === 'usageCount') metadata.usageCount = Number(parsed);
            else if (nestedKey === 'successRate') metadata.successRate = Number(parsed);
            else if (nestedKey === 'version') metadata.version = String(parsed);
            else if (nestedKey === 'source')
              metadata.source = parsed as 'learned' | 'imported' | 'built-in';
            else if (nestedKey === 'tags' && Array.isArray(parsed))
              metadata.tags = parsed as string[];
          }
        }
      }
    }

    if (Object.keys(requires).length > 0) {
      frontmatter.requires = requires;
    }
    if (Object.keys(metadata).length > 0) {
      frontmatter.metadata = metadata;
    }

    return { frontmatter, body };
  } catch {
    return { frontmatter: null, body: content };
  }
}

/**
 * Parse a simple YAML value (string, number, boolean, array)
 */
function parseYamlValue(value: string): string | number | boolean | string[] {
  // Handle arrays [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1);
    if (!inner.trim()) return [];
    return inner.split(',').map((s) => {
      const trimmed = s.trim();
      // Remove quotes if present
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    });
  }

  // Handle quoted strings
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Handle booleans
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Handle numbers
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;

  return value;
}

/**
 * Serialize skill to markdown with YAML frontmatter
 */
export function serializeSkill(skill: Skill): string {
  const lines: string[] = ['---'];

  lines.push(`name: ${escapeYamlString(skill.name)}`);
  if (skill.emoji) {
    lines.push(`emoji: ${skill.emoji}`);
  }
  lines.push(`description: ${escapeYamlString(skill.description)}`);

  if (skill.requires && Object.keys(skill.requires).length > 0) {
    lines.push('requires:');
    if (skill.requires.bins?.length) {
      lines.push(`  bins: [${skill.requires.bins.map(escapeYamlString).join(', ')}]`);
    }
    if (skill.requires.files?.length) {
      lines.push(`  files: [${skill.requires.files.map(escapeYamlString).join(', ')}]`);
    }
    if (skill.requires.env?.length) {
      lines.push(`  env: [${skill.requires.env.map(escapeYamlString).join(', ')}]`);
    }
  }

  lines.push('metadata:');
  if (skill.metadata.author) {
    lines.push(`  author: ${escapeYamlString(skill.metadata.author)}`);
  }
  lines.push(`  created: ${skill.metadata.created}`);
  if (skill.metadata.updated) {
    lines.push(`  updated: ${skill.metadata.updated}`);
  }
  lines.push(`  usageCount: ${skill.metadata.usageCount}`);
  lines.push(`  successRate: ${skill.metadata.successRate}`);
  if (skill.metadata.version) {
    lines.push(`  version: ${escapeYamlString(skill.metadata.version)}`);
  }
  if (skill.metadata.tags?.length) {
    lines.push(`  tags: [${skill.metadata.tags.map(escapeYamlString).join(', ')}]`);
  }
  if (skill.metadata.source) {
    lines.push(`  source: ${skill.metadata.source}`);
  }

  lines.push('---');
  lines.push('');
  lines.push(skill.content);

  return lines.join('\n');
}

/**
 * Convert frontmatter to full Skill object
 */
function frontmatterToSkill(frontmatter: SkillFrontmatter, body: string): Skill {
  return {
    name: frontmatter.name,
    emoji: frontmatter.emoji,
    description: frontmatter.description,
    requires: frontmatter.requires,
    content: body,
    metadata: {
      author: frontmatter.metadata?.author,
      created: frontmatter.metadata?.created || new Date().toISOString(),
      updated: frontmatter.metadata?.updated,
      usageCount: frontmatter.metadata?.usageCount || 0,
      successRate: frontmatter.metadata?.successRate || 0,
      version: frontmatter.metadata?.version,
      tags: frontmatter.metadata?.tags,
      source: frontmatter.metadata?.source,
    },
  };
}

/**
 * Check if requirements are satisfied
 */
export async function checkRequirements(
  requires: SkillRequirements | undefined,
  projectPath: string,
  fsModule: SkillsFsModule
): Promise<{ satisfied: boolean; missing: string[] }> {
  if (!requires) {
    return { satisfied: true, missing: [] };
  }

  const missing: string[] = [];

  // Check required files
  if (requires.files) {
    for (const file of requires.files) {
      const filePath = path.join(projectPath, file);
      try {
        await fsModule.access(filePath);
      } catch {
        missing.push(`file:${file}`);
      }
    }
  }

  // Check required environment variables
  if (requires.env) {
    for (const envVar of requires.env) {
      if (!process.env[envVar]) {
        missing.push(`env:${envVar}`);
      }
    }
  }

  // Note: bin checking would require executing 'which' or similar
  // For simplicity, we skip bin checking here (agents can handle it)

  return {
    satisfied: missing.length === 0,
    missing,
  };
}

/**
 * Load all skills from the skills directory
 */
export async function listSkills(projectPath: string, fsModule: SkillsFsModule): Promise<Skill[]> {
  const skillsDir = getSkillsDir(projectPath);
  const skills: Skill[] = [];

  try {
    const files = await fsModule.readdir(skillsDir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(skillsDir, file);
      try {
        const stat = await fsModule.stat(filePath);
        if (!stat.isFile()) continue;

        const content = await fsModule.readFile(filePath, 'utf-8');
        const { frontmatter, body } = parseSkillFrontmatter(content);

        if (frontmatter && frontmatter.name) {
          skills.push(frontmatterToSkill(frontmatter, body));
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Skills directory doesn't exist yet
  }

  return skills;
}

/**
 * Get a specific skill by name
 */
export async function getSkill(
  projectPath: string,
  skillName: string,
  fsModule: SkillsFsModule
): Promise<Skill | null> {
  const skillsDir = getSkillsDir(projectPath);
  const filePath = path.join(skillsDir, `${skillName}.md`);

  try {
    const content = await fsModule.readFile(filePath, 'utf-8');
    const { frontmatter, body } = parseSkillFrontmatter(content);

    if (frontmatter && frontmatter.name) {
      return frontmatterToSkill(frontmatter, body);
    }
  } catch {
    // Skill not found
  }

  return null;
}

/**
 * Load skills relevant to a feature/task
 * Filters by tags, requirements satisfaction, and sorts by success rate
 */
export async function loadRelevantSkills(
  projectPath: string,
  context: {
    tags?: string[];
    featureTitle?: string;
    featureDescription?: string;
  },
  fsModule: SkillsFsModule,
  maxSkills: number = 5
): Promise<SkillsLoadResult> {
  const allSkills = await listSkills(projectPath, fsModule);

  // Extract terms from context for matching
  const contextTerms = new Set<string>();
  if (context.tags) {
    context.tags.forEach((tag) => contextTerms.add(tag.toLowerCase()));
  }
  if (context.featureTitle) {
    context.featureTitle
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean)
      .forEach((term) => contextTerms.add(term));
  }
  if (context.featureDescription) {
    context.featureDescription
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean)
      .forEach((term) => contextTerms.add(term));
  }

  // Score and filter skills
  const scored: Array<{ skill: Skill; score: number }> = [];

  for (const skill of allSkills) {
    // Check requirements
    const { satisfied } = await checkRequirements(skill.requires, projectPath, fsModule);
    if (!satisfied) continue;

    // Calculate relevance score
    let score = 0;

    // Tag matching
    if (skill.metadata.tags) {
      for (const tag of skill.metadata.tags) {
        if (contextTerms.has(tag.toLowerCase())) {
          score += 3;
        }
      }
    }

    // Name/description matching
    const skillTerms = [
      ...skill.name.toLowerCase().split(/\W+/),
      ...skill.description.toLowerCase().split(/\W+/),
    ].filter(Boolean);

    for (const term of skillTerms) {
      if (contextTerms.has(term)) {
        score += 1;
      }
    }

    // Boost by success rate and usage
    score += skill.metadata.successRate * 2;
    score += Math.min(skill.metadata.usageCount / 10, 1);

    scored.push({ skill, score });
  }

  // Sort by score and take top N
  scored.sort((a, b) => b.score - a.score);
  const topSkills = scored.slice(0, maxSkills).map((s) => s.skill);

  // Build formatted prompt
  const formattedPrompt = buildSkillsPrompt(topSkills);

  return {
    skills: topSkills,
    formattedPrompt,
    totalLoaded: topSkills.length,
  };
}

/**
 * Build a prompt section for loaded skills
 */
function buildSkillsPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return '';
  }

  const lines: string[] = [
    '## Available Skills',
    '',
    'The following skills have been learned from previous work and may be relevant:',
    '',
  ];

  for (const skill of skills) {
    const emoji = skill.emoji ? `${skill.emoji} ` : '';
    lines.push(`### ${emoji}${skill.name}`);
    lines.push(`> ${skill.description}`);
    if (skill.metadata.successRate > 0) {
      lines.push(`> Success rate: ${Math.round(skill.metadata.successRate * 100)}%`);
    }
    lines.push('');
    lines.push(skill.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Create a new skill
 */
export async function createSkill(
  projectPath: string,
  options: CreateSkillOptions,
  fsModule: SkillsFsModule
): Promise<Skill> {
  const skillsDir = getSkillsDir(projectPath);

  // Ensure skills directory exists
  try {
    await fsModule.mkdir(skillsDir, { recursive: true });
  } catch {
    // Directory may already exist
  }

  const skill: Skill = {
    name: options.name,
    emoji: options.emoji,
    description: options.description,
    requires: options.requires,
    content: options.content,
    metadata: createDefaultMetadata(options.author, options.source),
  };

  if (options.tags) {
    skill.metadata.tags = options.tags;
  }

  const filePath = path.join(skillsDir, `${options.name}.md`);
  const content = serializeSkill(skill);
  await fsModule.writeFile(filePath, content);

  return skill;
}

/**
 * Update an existing skill
 */
export async function updateSkill(
  projectPath: string,
  skillName: string,
  updates: UpdateSkillOptions,
  fsModule: SkillsFsModule
): Promise<Skill | null> {
  const existing = await getSkill(projectPath, skillName, fsModule);
  if (!existing) {
    return null;
  }

  const updated: Skill = {
    ...existing,
    emoji: updates.emoji ?? existing.emoji,
    description: updates.description ?? existing.description,
    content: updates.content ?? existing.content,
    requires: updates.requires ?? existing.requires,
    metadata: {
      ...existing.metadata,
      updated: new Date().toISOString(),
      tags: updates.tags ?? existing.metadata.tags,
    },
  };

  const skillsDir = getSkillsDir(projectPath);
  const filePath = path.join(skillsDir, `${skillName}.md`);
  const content = serializeSkill(updated);
  await fsModule.writeFile(filePath, content);

  return updated;
}

/**
 * Delete a skill
 */
export async function deleteSkill(
  projectPath: string,
  skillName: string,
  fsModule: SkillsFsModule
): Promise<boolean> {
  const skillsDir = getSkillsDir(projectPath);
  const filePath = path.join(skillsDir, `${skillName}.md`);

  try {
    await fsModule.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Record skill usage (success or failure)
 */
export async function recordSkillUsage(
  projectPath: string,
  skillName: string,
  success: boolean,
  fsModule: SkillsFsModule
): Promise<void> {
  const skill = await getSkill(projectPath, skillName, fsModule);
  if (!skill) return;

  const totalUses = skill.metadata.usageCount + 1;
  const successCount = skill.metadata.usageCount * skill.metadata.successRate + (success ? 1 : 0);
  const newSuccessRate = successCount / totalUses;

  const updated: Skill = {
    ...skill,
    metadata: {
      ...skill.metadata,
      usageCount: totalUses,
      successRate: newSuccessRate,
      updated: new Date().toISOString(),
    },
  };

  const skillsDir = getSkillsDir(projectPath);
  const filePath = path.join(skillsDir, `${skillName}.md`);
  const content = serializeSkill(updated);
  await fsModule.writeFile(filePath, content);
}

/**
 * Initialize the skills folder with example skills
 */
export async function initializeSkillsFolder(
  projectPath: string,
  fsModule: SkillsFsModule
): Promise<void> {
  const skillsDir = getSkillsDir(projectPath);

  try {
    await fsModule.mkdir(skillsDir, { recursive: true });
  } catch {
    // Already exists
  }

  // Create an example skill if the folder is empty
  try {
    const files = await fsModule.readdir(skillsDir);
    if (files.filter((f) => f.endsWith('.md')).length === 0) {
      await createSkill(
        projectPath,
        {
          name: 'example-skill',
          emoji: '📝',
          description: 'An example skill showing the format',
          content: `# Example Skill

This is an example skill file showing the expected format.

## When to Use

Use this as a template for creating new skills.

## Instructions

1. Create a new .md file in .automaker/skills/
2. Add YAML frontmatter with name, description, and optional metadata
3. Write the skill content in markdown

## Notes

- Skills are automatically loaded based on relevance to the current task
- Usage statistics are tracked to improve recommendations
`,
          author: 'automaker',
          source: 'built-in',
          tags: ['example', 'template'],
        },
        fsModule
      );
    }
  } catch {
    // Couldn't list or create
  }
}
