/**
 * Agent Manifest Service
 *
 * Discovers, parses, caches, and queries project-defined agent manifests.
 * Manifests live at either:
 *   - .automaker/agents.yml  (single file)
 *   - .automaker/agents/*.yml  (directory of files, one agent per file)
 *
 * Responsibilities:
 *   - loadManifest: Discovers and parses YAML, validates against ProjectAgent type
 *   - getAgentsForProject: Cached lookup with polling-based invalidation
 *   - getAgent: Lookup a specific agent by name
 *   - getResolvedCapabilities: Merge project overrides onto base ROLE_CAPABILITIES
 *   - matchFeature: Run all match rules and return the best-matching agent + normalized confidence
 */

import path from 'path';
import fs from 'node:fs';
import { createLogger } from '@protolabsai/utils';
import type { AgentManifest, ProjectAgent, RoleCapabilities } from '@protolabsai/types';
import { ROLE_CAPABILITIES } from '@protolabsai/types';
import { minimatch } from 'minimatch';

/** Poll interval for manifest file change detection (ms). */
export const WATCH_POLL_INTERVAL_MS = 2000;

const logger = createLogger('AgentManifestService');

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimal feature shape used for matching. Subset of the full Feature type. */
export interface MatchableFeature {
  category?: string;
  title: string;
  description?: string;
  filesToModify?: string[];
}

/**
 * Result returned by matchFeature: the best-matching agent plus a
 * normalized confidence score in [0, 1) derived from the raw match score.
 *
 * Confidence uses a diminishing-returns formula: rawScore / (rawScore + 10)
 *   rawScore=5  → ~0.33  (weak match, e.g. single keyword)
 *   rawScore=10 → ~0.50  (moderate, e.g. one category hit)
 *   rawScore=20 → ~0.67  (good, e.g. category + several keywords)
 *   rawScore=30 → ~0.75  (strong, multiple signal types)
 */
export interface MatchResult {
  agent: ProjectAgent;
  confidence: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AgentManifestService {
  private cache = new Map<string, AgentManifest>();
  private watchers = new Map<string, ReturnType<typeof setInterval>>();

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Discovers and parses the agent manifest for a project.
   * Checks for `.automaker/agents.yml` first, then `.automaker/agents/*.yml`.
   * Returns null when no manifest is found.
   */
  async loadManifest(projectPath: string): Promise<AgentManifest | null> {
    const singleFile = path.join(projectPath, '.automaker', 'agents.yml');
    const dirPath = path.join(projectPath, '.automaker', 'agents');

    // Single-file manifest
    if (fs.existsSync(singleFile)) {
      try {
        const content = fs.readFileSync(singleFile, 'utf-8');
        const parsed = await this._parseYaml(content);
        const agents = this._extractAgents(parsed, singleFile);
        const version = this._extractVersion(parsed);
        return { version, agents };
      } catch (err) {
        logger.warn(`Failed to load agent manifest from ${singleFile}:`, err);
        return null;
      }
    }

    // Directory manifest: each .yml file in the directory
    if (fs.existsSync(dirPath) && this._isDirectory(dirPath)) {
      try {
        const files = fs
          .readdirSync(dirPath)
          .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
          .sort(); // deterministic ordering

        const agents: ProjectAgent[] = [];
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const parsed = await this._parseYaml(content);
            const fileAgents = this._extractAgents(parsed, filePath);
            agents.push(...fileAgents);
          } catch (err) {
            logger.warn(`Skipping invalid agent manifest file ${filePath}:`, err);
          }
        }
        return { version: '1', agents };
      } catch (err) {
        logger.warn(`Failed to load agent manifests from ${dirPath}:`, err);
        return null;
      }
    }

    return null;
  }

  /**
   * Returns the cached manifest for a project, loading it fresh on first access
   * and setting up a file watcher to invalidate the cache on changes.
   */
  async getAgentsForProject(projectPath: string): Promise<AgentManifest | null> {
    if (this.cache.has(projectPath)) {
      return this.cache.get(projectPath) ?? null;
    }

    const manifest = await this.loadManifest(projectPath);
    if (manifest) {
      this.cache.set(projectPath, manifest);
      this._watchForChanges(projectPath);
    }

    return manifest;
  }

  /**
   * Looks up a specific agent by its name within the project manifest.
   */
  async getAgent(projectPath: string, agentName: string): Promise<ProjectAgent | undefined> {
    const manifest = await this.getAgentsForProject(projectPath);
    return manifest?.agents.find((a) => a.name === agentName);
  }

  /**
   * Returns fully-resolved capabilities for an agent: merges the project-defined
   * agent's capability overrides on top of its base role's capabilities.
   * Returns null when the agent or its base role is not found.
   */
  async getResolvedCapabilities(
    projectPath: string,
    agentName: string
  ): Promise<RoleCapabilities | null> {
    const agent = await this.getAgent(projectPath, agentName);
    if (!agent) return null;

    const baseRole = ROLE_CAPABILITIES[agent.extends];
    if (!baseRole) {
      logger.warn(
        `Agent "${agentName}" extends unknown role "${agent.extends}". No capabilities resolved.`
      );
      return null;
    }

    if (!agent.capabilities) {
      return baseRole;
    }

    // Merge: project overrides win, role field is the agent's own name
    return {
      ...baseRole,
      ...agent.capabilities,
      role: agent.name,
    };
  }

  /**
   * Scores all project agents' match rules against the given feature and returns
   * the highest-scoring agent with a normalized confidence, or null if no agents
   * match (score > 0).
   *
   * Scoring:
   *   - Category match: +10 per matched category
   *   - Keyword match:  +5 per matched keyword (title + description)
   *   - File pattern:   +3 per (file × pattern) match via minimatch
   *
   * Confidence is normalized via diminishing-returns: rawScore / (rawScore + 10)
   */
  async matchFeature(projectPath: string, feature: MatchableFeature): Promise<MatchResult | null> {
    const manifest = await this.getAgentsForProject(projectPath);
    if (!manifest || manifest.agents.length === 0) return null;

    let bestMatch: ProjectAgent | null = null;
    let bestScore = 0;

    for (const agent of manifest.agents) {
      const score = this._scoreMatch(agent, feature);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent;
      }
    }

    if (!bestMatch) return null;

    return {
      agent: bestMatch,
      confidence: this._normalizeScore(bestScore),
    };
  }

  /**
   * Invalidates the cache for a specific project (or all projects).
   * Also stops the file watcher for that project.
   */
  invalidateCache(projectPath?: string): void {
    if (projectPath) {
      this.cache.delete(projectPath);
      this._stopWatcher(projectPath);
    } else {
      this.cache.clear();
      this.watchers.forEach((_w, key) => this._stopWatcher(key));
    }
  }

  /**
   * Stops all file watchers and clears state. Call during server shutdown.
   */
  dispose(): void {
    this.invalidateCache();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _parseYaml(content: string): Promise<unknown> {
    // Lazy import to avoid CJS/ESM compatibility issues (same pattern as proto-config.ts)
    const { parse } = await import('yaml');
    return parse(content);
  }

  /**
   * Extracts and validates an array of ProjectAgent objects from parsed YAML.
   * Accepts either:
   *   - `{ version, agents: [...] }` (manifest format)
   *   - `[...]` (bare array of agents)
   *   - `{ name, extends, ... }` (single agent object)
   */
  private _extractAgents(parsed: unknown, sourceFile: string): ProjectAgent[] {
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    let candidates: unknown[];

    if (Array.isArray(parsed)) {
      candidates = parsed;
    } else {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj['agents'])) {
        candidates = obj['agents'];
      } else if (typeof obj['name'] === 'string' && typeof obj['extends'] === 'string') {
        // Single agent defined directly at the file root
        candidates = [obj];
      } else {
        logger.warn(`Unrecognized manifest format in ${sourceFile}`);
        return [];
      }
    }

    return candidates.reduce<ProjectAgent[]>((acc, item) => {
      const agent = this._validateAgent(item, sourceFile);
      if (agent) acc.push(agent);
      return acc;
    }, []);
  }

  /**
   * Validates and coerces a raw YAML object into a ProjectAgent.
   * Returns null for invalid entries (missing required fields).
   */
  private _validateAgent(raw: unknown, sourceFile: string): ProjectAgent | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;

    if (typeof obj['name'] !== 'string' || !obj['name']) {
      logger.warn(`Agent in ${sourceFile} is missing required field "name". Skipping.`);
      return null;
    }

    if (typeof obj['extends'] !== 'string' || !obj['extends']) {
      logger.warn(
        `Agent "${obj['name']}" in ${sourceFile} is missing required field "extends". Skipping.`
      );
      return null;
    }

    const agent: ProjectAgent = {
      name: obj['name'],
      extends: obj['extends'],
      description: typeof obj['description'] === 'string' ? obj['description'] : '',
    };

    if (typeof obj['model'] === 'string') agent.model = obj['model'];
    if (typeof obj['promptFile'] === 'string') agent.promptFile = obj['promptFile'];

    if (obj['capabilities'] && typeof obj['capabilities'] === 'object') {
      agent.capabilities = obj['capabilities'] as ProjectAgent['capabilities'];
    }

    if (obj['match'] && typeof obj['match'] === 'object') {
      const m = obj['match'] as Record<string, unknown>;
      agent.match = {
        categories: Array.isArray(m['categories'])
          ? (m['categories'] as unknown[]).filter((c): c is string => typeof c === 'string')
          : [],
        keywords: Array.isArray(m['keywords'])
          ? (m['keywords'] as unknown[]).filter((k): k is string => typeof k === 'string')
          : [],
        filePatterns: Array.isArray(m['filePatterns'])
          ? (m['filePatterns'] as unknown[]).filter((p): p is string => typeof p === 'string')
          : [],
      };
    }

    return agent;
  }

  private _extractVersion(parsed: unknown): string {
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj['version'] === 'string') return obj['version'];
      if (typeof obj['version'] === 'number') return String(obj['version']);
    }
    return '1';
  }

  /**
   * Normalizes a raw match score to a [0, 1) confidence value using a
   * diminishing-returns formula: rawScore / (rawScore + 10).
   *
   * This ensures low-score matches produce low confidence (< 0.5) while
   * high-score matches approach — but never reach — 1.0.
   */
  private _normalizeScore(rawScore: number): number {
    if (rawScore <= 0) return 0;
    return rawScore / (rawScore + 10);
  }

  private _scoreMatch(agent: ProjectAgent, feature: MatchableFeature): number {
    const { match } = agent;
    if (!match) return 0;

    let score = 0;

    // Category match (+10 each)
    if (match.categories.length > 0 && feature.category) {
      const featureCategory = feature.category.toLowerCase();
      for (const cat of match.categories) {
        if (cat.toLowerCase() === featureCategory) {
          score += 10;
        }
      }
    }

    // Keyword match in title + description (+5 each)
    if (match.keywords.length > 0) {
      const text = `${feature.title} ${feature.description ?? ''}`.toLowerCase();
      for (const keyword of match.keywords) {
        if (keyword && text.includes(keyword.toLowerCase())) {
          score += 5;
        }
      }
    }

    // File pattern match via minimatch (+3 per matched file×pattern pair)
    if (
      match.filePatterns.length > 0 &&
      feature.filesToModify &&
      feature.filesToModify.length > 0
    ) {
      for (const pattern of match.filePatterns) {
        for (const file of feature.filesToModify) {
          if (minimatch(file, pattern, { matchBase: true })) {
            score += 3;
          }
        }
      }
    }

    return score;
  }

  private _watchForChanges(projectPath: string): void {
    if (this.watchers.has(projectPath)) return;

    const singleFile = path.join(projectPath, '.automaker', 'agents.yml');
    const dirPath = path.join(projectPath, '.automaker', 'agents');

    // Collect all files to track (single file OR all .yml files in directory).
    // We record their mtime at watch-start and invalidate the cache if any of
    // them change.  This mtime-polling approach is used instead of fs.watch
    // because fs.watch({ recursive: true }) is a no-op on Linux prior to
    // Node 22 and unreliable with certain native binding versions.
    const getTrackedFiles = (): string[] => {
      if (fs.existsSync(singleFile)) return [singleFile];
      if (this._isDirectory(dirPath)) {
        try {
          return fs
            .readdirSync(dirPath)
            .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
            .map((f) => path.join(dirPath, f));
        } catch {
          return [];
        }
      }
      return [];
    };

    const initialFiles = getTrackedFiles();
    if (initialFiles.length === 0) return;

    // Snapshot mtime for each file at watch-start.
    const mtimes = new Map<string, number>();
    for (const f of initialFiles) {
      try {
        mtimes.set(f, fs.statSync(f).mtimeMs);
      } catch {
        mtimes.set(f, 0);
      }
    }

    const timer = setInterval(() => {
      const currentFiles = getTrackedFiles();
      let changed = currentFiles.length !== mtimes.size;

      if (!changed) {
        for (const f of currentFiles) {
          try {
            const mtime = fs.statSync(f).mtimeMs;
            if (mtime !== mtimes.get(f)) {
              changed = true;
              break;
            }
          } catch {
            changed = true; // file disappeared
            break;
          }
        }
      }

      if (changed) {
        this.cache.delete(projectPath);
        logger.info(`Agent manifest cache invalidated for ${projectPath} (file changed)`);
        // Refresh the mtime snapshot so we only fire once per actual change.
        mtimes.clear();
        for (const f of getTrackedFiles()) {
          try {
            mtimes.set(f, fs.statSync(f).mtimeMs);
          } catch {
            mtimes.set(f, 0);
          }
        }
      }
    }, WATCH_POLL_INTERVAL_MS);

    // Don't hold the event loop open just for watching.
    if (typeof timer.unref === 'function') timer.unref();

    this.watchers.set(projectPath, timer);
    logger.debug(`Polling agent manifest at ${initialFiles.join(', ')}`);
  }

  private _stopWatcher(projectPath: string): void {
    const timer = this.watchers.get(projectPath);
    if (timer) {
      clearInterval(timer);
      this.watchers.delete(projectPath);
    }
  }

  private _isDirectory(p: string): boolean {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: AgentManifestService | undefined;

export function getAgentManifestService(): AgentManifestService {
  if (!_instance) {
    _instance = new AgentManifestService();
  }
  return _instance;
}
