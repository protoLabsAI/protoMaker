/**
 * Prompt template routes.
 *
 * Prompts are stored as Markdown files in a `prompts/` directory relative to
 * the server's working directory.  Each file uses YAML frontmatter for metadata:
 *
 *   ---
 *   name: My Prompt
 *   description: A short description shown in the UI.
 *   variables:
 *     - topic
 *     - audience
 *   ---
 *   You are a helpful assistant. Write about {{topic}} for {{audience}}.
 *
 * The `id` field is derived from the filename (without the `.md` extension).
 *
 * Endpoints:
 *   GET /api/prompts        → list all prompt templates (sorted by name)
 *   GET /api/prompts/:id    → get a single prompt by ID
 *   PUT /api/prompts/:id    → save updated content to the filesystem
 */

import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';

const router = Router();

// ─── Paths ────────────────────────────────────────────────────────────────────

const PROMPTS_DIR = path.join(process.cwd(), 'prompts');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PromptFile {
  /** Filename without the `.md` extension. Used as the URL-safe identifier. */
  id: string;
  /** Human-readable display name (from frontmatter `name:` field). */
  name: string;
  /** Short description shown in the sidebar (from frontmatter `description:`). */
  description: string;
  /**
   * Variable placeholder names extracted from the template.
   * Includes both frontmatter-declared variables and inline `{{name}}` patterns.
   */
  variables: string[];
  /** The prompt body — everything after the closing `---` frontmatter delimiter. */
  content: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a Markdown file.
 *
 * Handles the subset of YAML used by prompts:
 *   - `name: value`
 *   - `description: value`
 *   - `variables:` followed by `  - item` list entries
 *
 * Returns defaults for any missing fields and preserves the raw body.
 */
function parseFrontmatter(raw: string): {
  name: string;
  description: string;
  variables: string[];
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { name: '', description: '', variables: [], body: raw };
  }

  const [, frontmatter = '', body = ''] = match;

  let name = '';
  let description = '';
  const variables: string[] = [];
  let inVariables = false;

  for (const line of frontmatter.split('\n')) {
    const nameLine = line.match(/^name:\s*(.+)$/);
    const descLine = line.match(/^description:\s*(.+)$/);
    const varItem = line.match(/^  - (.+)$/);
    const varListLine = line.match(/^variables:\s*$/);

    if (nameLine) {
      name = nameLine[1]!.trim();
      inVariables = false;
    } else if (descLine) {
      description = descLine[1]!.trim();
      inVariables = false;
    } else if (varListLine) {
      inVariables = true;
    } else if (inVariables && varItem) {
      variables.push(varItem[1]!.trim());
    } else if (line.match(/^\w/)) {
      // Any unindented key resets the inVariables flag
      inVariables = false;
    }
  }

  return { name, description, variables, body: body.trimStart() };
}

/**
 * Extract unique `{{variableName}}` placeholders from a string.
 * Merged with any frontmatter-declared variables to produce the full list.
 */
function extractInlineVariables(content: string): string[] {
  const matches = content.matchAll(/\{\{(\w+)\}\}/g);
  const seen = new Set<string>();
  for (const m of matches) {
    if (m[1]) seen.add(m[1]);
  }
  return Array.from(seen);
}

/**
 * Load a single prompt file by ID (filename without `.md`).
 * Returns `null` if the file does not exist or cannot be parsed.
 */
function loadPrompt(id: string): PromptFile | null {
  const filepath = path.join(PROMPTS_DIR, `${id}.md`);
  if (!fs.existsSync(filepath)) return null;

  try {
    const raw = fs.readFileSync(filepath, 'utf-8');
    const { name, description, variables: fmVars, body } = parseFrontmatter(raw);

    // Merge frontmatter-declared vars with inline {{var}} patterns
    const inlineVars = extractInlineVariables(body);
    const allVars = Array.from(new Set([...fmVars, ...inlineVars]));

    return {
      id,
      name: name || id,
      description: description || '',
      variables: allVars,
      content: body,
    };
  } catch {
    return null;
  }
}

/**
 * List all `.md` files in PROMPTS_DIR, sorted alphabetically by name.
 * Returns an empty array if the directory does not exist.
 */
function listPrompts(): PromptFile[] {
  if (!fs.existsSync(PROMPTS_DIR)) return [];

  try {
    return fs
      .readdirSync(PROMPTS_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => loadPrompt(f.slice(0, -3)))
      .filter((p): p is PromptFile => p !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Sanitise a prompt ID: only allow alphanumerics, hyphens, and underscores. */
function sanitiseId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

// ─── GET / — list all prompts ─────────────────────────────────────────────────

router.get('/', (_req: Request, res: Response): void => {
  res.json(listPrompts());
});

// ─── GET /:id — get a single prompt ──────────────────────────────────────────

router.get('/:id', (req: Request, res: Response): void => {
  const id = sanitiseId(String(req.params['id'] ?? ''));
  if (!id) {
    res.status(400).json({ error: 'Invalid prompt ID' });
    return;
  }

  const prompt = loadPrompt(id);
  if (!prompt) {
    res.status(404).json({ error: `Prompt "${id}" not found` });
    return;
  }

  res.json(prompt);
});

// ─── PUT /:id — save updated content ─────────────────────────────────────────

router.put('/:id', (req: Request, res: Response): void => {
  const id = sanitiseId(String(req.params['id'] ?? ''));
  if (!id) {
    res.status(400).json({ error: 'Invalid prompt ID' });
    return;
  }

  const { content } = req.body as { content?: unknown };
  if (typeof content !== 'string') {
    res.status(400).json({ error: '"content" must be a string' });
    return;
  }

  const filepath = path.join(PROMPTS_DIR, `${id}.md`);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: `Prompt "${id}" not found` });
    return;
  }

  try {
    // Preserve the frontmatter and overwrite only the body
    const raw = fs.readFileSync(filepath, 'utf-8');
    const frontmatterMatch = raw.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/);
    const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
    fs.writeFileSync(filepath, frontmatter + content, 'utf-8');

    const updated = loadPrompt(id);
    res.json(updated);
  } catch (err) {
    console.error(`[PUT /api/prompts/${id}]`, err);
    res.status(500).json({ error: 'Failed to save prompt' });
  }
});

// ─── POST / — create a new prompt ─────────────────────────────────────────────

router.post('/', (req: Request, res: Response): void => {
  const { id, name, description, variables, content } = req.body as {
    id?: string;
    name?: string;
    description?: string;
    variables?: string[];
    content?: string;
  };

  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: '"id" is required (alphanumeric, hyphens, underscores)' });
    return;
  }

  const safeId = sanitiseId(id);
  if (!safeId) {
    res.status(400).json({ error: 'Invalid prompt ID — use alphanumeric, hyphens, or underscores' });
    return;
  }

  const filepath = path.join(PROMPTS_DIR, `${safeId}.md`);
  if (fs.existsSync(filepath)) {
    res.status(409).json({ error: `Prompt "${safeId}" already exists` });
    return;
  }

  // Ensure prompts directory exists
  if (!fs.existsSync(PROMPTS_DIR)) {
    fs.mkdirSync(PROMPTS_DIR, { recursive: true });
  }

  // Build frontmatter
  const fmName = name ?? safeId;
  const fmDesc = description ?? '';
  const fmVars = Array.isArray(variables) && variables.length > 0
    ? `\nvariables:\n${variables.map((v) => `  - ${v}`).join('\n')}`
    : '';
  const frontmatter = `---\nname: ${fmName}\ndescription: ${fmDesc}${fmVars}\n---\n`;
  const body = typeof content === 'string' ? content : '';

  try {
    fs.writeFileSync(filepath, frontmatter + body, 'utf-8');
    const created = loadPrompt(safeId);
    res.status(201).json(created);
  } catch (err) {
    console.error(`[POST /api/prompts]`, err);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// ─── DELETE /:id — delete a prompt ────────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response): void => {
  const id = sanitiseId(String(req.params['id'] ?? ''));
  if (!id) {
    res.status(400).json({ error: 'Invalid prompt ID' });
    return;
  }

  const filepath = path.join(PROMPTS_DIR, `${id}.md`);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: `Prompt "${id}" not found` });
    return;
  }

  try {
    fs.unlinkSync(filepath);
    res.json({ deleted: true, id });
  } catch (err) {
    console.error(`[DELETE /api/prompts/${id}]`, err);
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

export default router;
