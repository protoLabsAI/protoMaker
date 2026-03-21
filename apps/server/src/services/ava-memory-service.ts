/**
 * Ava Memory Service — persistent key-value memory store for the Ava chat assistant
 *
 * Stores memory entries at {projectPath}/.automaker/ava-memory.json using atomic
 * writes (temp file + rename) for crash safety. Each entry has a key, content,
 * optional tags, timestamps, and an access counter for recall ranking.
 *
 * Recall ranking: exact key match > tag match > substring match, sorted by
 * recency (updatedAt descending) within each tier.
 */

import path from 'node:path';
import { createLogger, atomicWriteJson, readJsonFile } from '@protolabsai/utils';
import { getAutomakerDir, ensureAutomakerDir } from '@protolabsai/platform';

const logger = createLogger('AvaMemoryService');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  key: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  accessCount: number;
}

export interface MemoryStore {
  version: 1;
  entries: Record<string, MemoryEntry>;
}

/** A recall result with its match tier for ranking transparency */
export interface RecallResult {
  entry: MemoryEntry;
  matchType: 'exact' | 'tag' | 'substring';
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_FILENAME = 'ava-memory.json';

const EMPTY_STORE: MemoryStore = { version: 1, entries: {} };

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class AvaMemoryService {
  private readonly projectPath: string;
  private readonly filePath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.filePath = path.join(getAutomakerDir(projectPath), MEMORY_FILENAME);
  }

  /**
   * Create or update a memory entry.
   *
   * If an entry with the given key already exists, its content and tags are
   * updated and the updatedAt timestamp is refreshed. Otherwise a new entry
   * is created with both createdAt and updatedAt set to now.
   */
  async remember(key: string, content: string, tags: string[] = []): Promise<MemoryEntry> {
    const store = await this.load();
    const now = new Date().toISOString();
    const existing = store.entries[key];

    const entry: MemoryEntry = existing
      ? { ...existing, content, tags, updatedAt: now }
      : { key, content, tags, createdAt: now, updatedAt: now, accessCount: 0 };

    store.entries[key] = entry;
    await this.save(store);

    logger.info(`Memory remembered: key="${key}", tags=[${tags.join(', ')}]`);
    return entry;
  }

  /**
   * Search for memory entries matching a query string.
   *
   * Ranking tiers (highest to lowest priority):
   *   1. Exact key match
   *   2. Tag match (query appears as a tag on the entry)
   *   3. Substring match (query found in key or content, case-insensitive)
   *
   * Within each tier, results are sorted by updatedAt descending (most recent first).
   * Each matched entry's accessCount is incremented.
   */
  async recall(query: string): Promise<RecallResult[]> {
    const store = await this.load();
    const queryLower = query.toLowerCase();

    const exactMatches: RecallResult[] = [];
    const tagMatches: RecallResult[] = [];
    const substringMatches: RecallResult[] = [];

    for (const entry of Object.values(store.entries)) {
      if (entry.key === query) {
        exactMatches.push({ entry, matchType: 'exact' });
      } else if (entry.tags.some((tag) => tag.toLowerCase() === queryLower)) {
        tagMatches.push({ entry, matchType: 'tag' });
      } else if (
        entry.key.toLowerCase().includes(queryLower) ||
        entry.content.toLowerCase().includes(queryLower)
      ) {
        substringMatches.push({ entry, matchType: 'substring' });
      }
    }

    const sortByRecency = (a: RecallResult, b: RecallResult): number =>
      new Date(b.entry.updatedAt).getTime() - new Date(a.entry.updatedAt).getTime();

    exactMatches.sort(sortByRecency);
    tagMatches.sort(sortByRecency);
    substringMatches.sort(sortByRecency);

    const results = [...exactMatches, ...tagMatches, ...substringMatches];

    // Increment access counts for all matched entries
    if (results.length > 0) {
      for (const result of results) {
        store.entries[result.entry.key].accessCount += 1;
        result.entry = store.entries[result.entry.key];
      }
      await this.save(store);
    }

    logger.debug(
      `Memory recall: query="${query}", exact=${exactMatches.length}, tag=${tagMatches.length}, substring=${substringMatches.length}`
    );

    return results;
  }

  /**
   * Remove a memory entry by key.
   *
   * Returns true if the entry existed and was removed, false if the key was
   * not found.
   */
  async forget(key: string): Promise<boolean> {
    const store = await this.load();

    if (!(key in store.entries)) {
      logger.debug(`Memory forget: key="${key}" not found`);
      return false;
    }

    delete store.entries[key];
    await this.save(store);

    logger.info(`Memory forgotten: key="${key}"`);
    return true;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  private async load(): Promise<MemoryStore> {
    return readJsonFile<MemoryStore>(this.filePath, { ...EMPTY_STORE, entries: {} });
  }

  private async save(store: MemoryStore): Promise<void> {
    await ensureAutomakerDir(this.projectPath);
    await atomicWriteJson(this.filePath, store);
  }
}
