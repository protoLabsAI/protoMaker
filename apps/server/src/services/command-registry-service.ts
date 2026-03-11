/**
 * CommandRegistryService — discovers and caches slash commands from multiple sources.
 *
 * Sources:
 *   1. MCP plugin commands — packages/mcp-server/plugins/automaker/commands/*.md
 *   2. Project skills — .claude/skills/*.md      (relative to repoRoot)
 *
 * Each file-backed command is parsed for YAML frontmatter fields:
 *   name, description, category, argument-hint, allowed-tools, model
 *
 * The cache is invalidated via fs.watch on each scanned directory.
 * Watchers are cleaned up when destroy() is called.
 */

import { existsSync, readdirSync, readFileSync, watch } from 'node:fs';
import { join, resolve } from 'node:path';

import { createLogger } from '@protolabsai/utils';
// Re-export the canonical types from @protolabsai/types (defined in libs/types/src/chat.ts).
// We re-declare here as type aliases so the server can compile even when the worktree
// resolves @protolabsai/types to the main-repo dist (known P3 worktree symlink limitation).
export type SlashCommandSource = 'mcp-plugin' | 'project-skill';

export type SlashCommandCategory = 'operations' | 'engineering' | 'team' | 'planning' | 'setup';

export interface SlashCommand {
  name: string;
  description: string;
  category?: SlashCommandCategory;
  argumentHint?: string;
  allowedTools?: string[];
  model?: string;
  source: SlashCommandSource;
  body?: string;
}

const logger = createLogger('CommandRegistry');

// ---------------------------------------------------------------------------
// Minimal YAML frontmatter parser (no external dependency)
// Handles the subset used in command .md files:
//   scalar strings, multi-line block scalars, and YAML sequences (- item)
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  category?: string;
  'argument-hint'?: string;
  'allowed-tools'?: string[];
  model?: string;
}

/**
 * Extract YAML frontmatter and body from a markdown string.
 * Returns null if the file does not start with a `---` fence.
 */
function parseFrontmatter(content: string): { fm: ParsedFrontmatter; body: string } | null {
  if (!content.startsWith('---')) return null;

  const end = content.indexOf('\n---', 3);
  if (end === -1) return null;

  const yamlBlock = content.slice(3, end).trim();
  const body = content.slice(end + 4).trim();

  const fm: ParsedFrontmatter = {};
  const lines = yamlBlock.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    // Check if this key starts a YAML sequence on the following lines
    if (rest === '' || rest === null) {
      // Possibly a sequence block — collect `  - item` lines
      const items: string[] = [];
      i++;
      while (i < lines.length && /^\s+-\s/.test(lines[i])) {
        // Strip comment after the value (e.g. "  - Read  # reason")
        const raw = lines[i]
          .replace(/^\s+-\s+/, '')
          .replace(/#.*$/, '')
          .trim();
        if (raw) items.push(raw);
        i++;
      }
      if (items.length > 0) {
        (fm as Record<string, unknown>)[key] = items;
      }
      continue;
    }

    // Scalar value — strip inline comments
    const value = rest.replace(/#.*$/, '').trim();
    (fm as Record<string, unknown>)[key] = value;
    i++;
  }

  return { fm, body };
}

const VALID_CATEGORIES = new Set<SlashCommandCategory>([
  'operations',
  'engineering',
  'team',
  'planning',
  'setup',
]);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CommandRegistryService {
  private cache: Map<string, SlashCommand> = new Map();
  private watchers: ReturnType<typeof watch>[] = [];
  private repoRoot: string;
  private mcpPluginCommandsDir: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.mcpPluginCommandsDir = resolve(repoRoot, 'packages/mcp-server/plugins/automaker/commands');
  }

  /**
   * Initialize the service: scan command directories and start filesystem
   * watchers for cache invalidation.
   */
  initialize(): void {
    // Scan each file-backed source
    this.scanDirectory(this.mcpPluginCommandsDir, 'mcp-plugin');
    this.scanDirectory(join(this.repoRoot, '.claude/skills'), 'project-skill');

    // Set up watchers for cache invalidation
    this.watchDirectory(this.mcpPluginCommandsDir, 'mcp-plugin');
    this.watchDirectory(join(this.repoRoot, '.claude/skills'), 'project-skill');

    logger.info(`CommandRegistry initialized with ${this.cache.size} commands`);
  }

  /** Return all registered commands as an array. */
  getAll(): SlashCommand[] {
    return Array.from(this.cache.values());
  }

  /** Look up a single command by name. */
  get(name: string): SlashCommand | undefined {
    return this.cache.get(name);
  }

  /** Stop all filesystem watchers and clear the cache. */
  destroy(): void {
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {
        // ignore
      }
    }
    this.watchers = [];
    this.cache.clear();
    logger.info('CommandRegistry destroyed');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Scan a directory for *.md files and parse each as a SlashCommand.
   * Silently skips non-existent directories.
   */
  private scanDirectory(dir: string, source: SlashCommandSource): void {
    if (!existsSync(dir)) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      logger.warn(`[CommandRegistry] Failed to read directory ${dir}:`, err);
      return;
    }

    let loaded = 0;
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = join(dir, entry);
      const cmd = this.parseCommandFile(filePath, source);
      if (cmd) {
        this.cache.set(cmd.name, cmd);
        loaded++;
      }
    }

    if (loaded > 0) {
      logger.info(`[CommandRegistry] Loaded ${loaded} commands from ${dir} (source: ${source})`);
    }
  }

  /**
   * Parse a single markdown file into a SlashCommand.
   * Returns null if the file cannot be parsed or is missing required fields.
   */
  private parseCommandFile(filePath: string, source: SlashCommandSource): SlashCommand | null {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (err) {
      logger.warn(`[CommandRegistry] Failed to read ${filePath}:`, err);
      return null;
    }

    const parsed = parseFrontmatter(content);
    if (!parsed) {
      // No frontmatter — derive name from filename, use empty description
      const name = filePath.split('/').pop()!.replace(/\.md$/, '');
      return { name, description: '', source, body: content };
    }

    const { fm, body } = parsed;
    const name = fm.name ?? filePath.split('/').pop()!.replace(/\.md$/, '');

    const cmd: SlashCommand = {
      name,
      description: fm.description ?? '',
      source,
      body: body || undefined,
    };

    if (fm.category && VALID_CATEGORIES.has(fm.category as SlashCommandCategory)) {
      cmd.category = fm.category as SlashCommandCategory;
    }
    if (fm['argument-hint']) cmd.argumentHint = fm['argument-hint'];
    if (Array.isArray(fm['allowed-tools']) && fm['allowed-tools'].length > 0) {
      cmd.allowedTools = fm['allowed-tools'];
    }
    if (fm.model) cmd.model = fm.model;

    return cmd;
  }

  /**
   * Watch a directory for changes and re-scan it on any change event.
   * Silently skips non-existent directories (the watcher is not set up).
   */
  private watchDirectory(dir: string, source: SlashCommandSource): void {
    if (!existsSync(dir)) return;

    try {
      const watcher = watch(dir, { persistent: false }, (eventType, filename) => {
        if (!filename?.endsWith('.md')) return;
        logger.info(
          `[CommandRegistry] Change detected in ${dir} (${eventType}: ${filename}) — re-scanning`
        );
        // Remove stale entries for this source before re-scanning
        for (const [name, cmd] of this.cache.entries()) {
          if (cmd.source === source) {
            this.cache.delete(name);
          }
        }
        this.scanDirectory(dir, source);
      });
      this.watchers.push(watcher);
    } catch (err) {
      logger.warn(`[CommandRegistry] Failed to watch directory ${dir}:`, err);
    }
  }
}
