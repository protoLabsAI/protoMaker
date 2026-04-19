/**
 * Feature Loader - Handles loading and managing features from individual feature folders
 * Each feature is stored in .automaker/features/{featureId}/feature.json
 */

import type { Dirent } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  Feature,
  DescriptionHistoryEntry,
  FeatureStatus,
  FeatureStore,
  StatusTransition,
} from '@protolabsai/types';
import { normalizeFeatureStatus } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import type { TopicBus } from '../lib/topic-bus.js';
import {
  createLogger,
  atomicWriteJson,
  readJsonWithRecovery,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
  slugify,
} from '@protolabsai/utils';
import * as secureFs from '../lib/secure-fs.js';
import {
  getAutomakerDir,
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getFeatureBackupDir,
  getAppSpecPath,
  ensureAutomakerDir,
  isValidBranchName,
} from '@protolabsai/platform';
import { addImplementedFeature, type ImplementedFeature } from '../lib/xml-extractor.js';
import { debugLog } from '../lib/debug-log.js';
import type { DataIntegrityWatchdogService } from './data-integrity-watchdog-service.js';
import type { ProjectSlugResolver } from './project-slug-resolver.js';
import { featuresByStatus } from '../lib/prometheus.js';

const execAsync = promisify(exec);
const logger = createLogger('FeatureLoader');

// Re-export Feature type for convenience
export type { Feature };

/**
 * Extract the bracket keyword from a feature title used for epic auto-adoption matching.
 *
 * Recognized patterns (keyword is the alphabetic prefix before the version number):
 *   [Arc 1.2]        → "Arc"
 *   [TR-1.2]         → "TR"
 *   [DD-1.2]         → "DD"
 *   [Epic-Name 1.2]  → "Epic-Name"
 *
 * Returns null when the title does not start with a recognized bracket pattern.
 */
export function extractEpicKeyword(title: string): string | null {
  // Match [PREFIX SEPARATOR VERSION] at the start of the title
  // PREFIX: one or more words joined by hyphens (letters/digits only within each word)
  // SEPARATOR: a single space or dash between the prefix and the version number
  // VERSION: one or more dot-separated digit groups (e.g. 1, 0.1, 2.3.4)
  const match = title
    .trim()
    .match(/^\[([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)[\s\-](\d+(?:\.\d+)+)\]/);
  if (!match) return null;
  return match[1];
}

/**
 * Find the best candidate parent epic for auto-adoption given a child feature title.
 *
 * Matching rules:
 * - Extracts the keyword from the bracket prefix (e.g., "Arc" from "[Arc 1.2] xyz")
 * - Searches active (non-archived) epics for a title that contains the keyword (case-insensitive)
 *   or whose slugified title contains the slugified keyword
 * - Returns the candidate only when exactly ONE epic matches — ambiguous matches are skipped
 *   to avoid mis-assignment
 *
 * @param title - Title of the child feature being created
 * @param features - All features in the project (pre-loaded)
 * @returns The matching epic Feature, or null if no unique match found
 */
export function findCandidateEpic(title: string, features: Feature[]): Feature | null {
  if (!title) return null;

  const keyword = extractEpicKeyword(title);
  if (!keyword || keyword.length < 2) return null;

  const keywordLower = keyword.toLowerCase();
  const keywordSlug = slugify(keyword);

  const epics = features.filter((f) => f.isEpic && !f.archived);

  const candidates = epics.filter((epic) => {
    if (!epic.title) return false;
    const epicTitleLower = epic.title.toLowerCase();
    const epicSlug = slugify(epic.title);
    return epicTitleLower.includes(keywordLower) || epicSlug.includes(keywordSlug);
  });

  // Only auto-adopt when exactly one epic matches — avoid wrong assignment on ambiguous results
  return candidates.length === 1 ? candidates[0] : null;
}

export class FeatureLoader implements FeatureStore {
  private integrityWatchdog: DataIntegrityWatchdogService | null = null;
  private events: EventEmitter | null = null;
  private topicBus: TopicBus | null = null;
  /** Instance ID stamped onto newly created features as createdByInstance */
  private instanceId: string | null = null;
  private projectSlugResolver: ProjectSlugResolver | null = null;

  setIntegrityWatchdog(watchdog: DataIntegrityWatchdogService): void {
    this.integrityWatchdog = watchdog;
  }

  setEventEmitter(events: EventEmitter): void {
    this.events = events;
  }

  setTopicBus(topicBus: TopicBus): void {
    this.topicBus = topicBus;
  }

  /**
   * Set the instance ID used to stamp createdByInstance on new features.
   * Call this once at startup when multi-instance identity is configured.
   */
  setInstanceId(instanceId: string): void {
    this.instanceId = instanceId;
  }

  /**
   * Set the project slug resolver used to auto-assign projectSlug on feature creation.
   * Call this once at startup when the resolver is available.
   */
  setProjectSlugResolver(resolver: ProjectSlugResolver): void {
    this.projectSlugResolver = resolver;
  }
  /**
   * Normalize feature status to canonical values
   * Defensive: ensures all features use the 6-status system
   */
  protected normalizeFeature(feature: Feature): Feature {
    let normalized = feature;

    // Guard: archived features are always treated as 'done' regardless of what
    // the stub file says. This prevents the LE state machine from picking up
    // archived stubs as active work items.
    if (normalized.archived === true) {
      normalized = { ...normalized, status: 'done' as FeatureStatus };
    }

    // Normalize status
    if (!normalized.status) {
      normalized = { ...normalized, status: 'backlog' };
    } else {
      const normalizedStatus = normalizeFeatureStatus(normalized.status, (from, to) => {
        logger.debug(`Normalizing feature ${feature.id} status: ${from} → ${to}`);
      });

      if (normalizedStatus !== normalized.status) {
        normalized = { ...normalized, status: normalizedStatus };
      }
    }

    // Normalize featureType — default to 'code' for all existing features
    if (!normalized.featureType) {
      normalized = { ...normalized, featureType: 'code' };
    }

    // Normalize dependencies — ensure always an array (may be stored as JSON string)
    if (normalized.dependencies && typeof normalized.dependencies === 'string') {
      try {
        const parsed = JSON.parse(normalized.dependencies as unknown as string);
        normalized = { ...normalized, dependencies: Array.isArray(parsed) ? parsed : [] };
      } catch {
        normalized = { ...normalized, dependencies: [] };
      }
    }

    // Migrate legacy remediationCycleCount to split budgets on read.
    // When a feature only has the old single counter and not the new split fields,
    // initialize ciRemediationCount and reviewRemediationCount to 0 so that
    // the RemediationBudgetEnforcer can use the legacy count for total-cap checking
    // via the remediationCycleCount backward-compat path.
    if (
      typeof normalized.remediationCycleCount === 'number' &&
      normalized.remediationCycleCount > 0 &&
      normalized.ciRemediationCount == null &&
      normalized.reviewRemediationCount == null
    ) {
      normalized = {
        ...normalized,
        ciRemediationCount: 0,
        reviewRemediationCount: 0,
      };
    }

    return normalized;
  }

  /**
   * Get the features directory path
   */
  getFeaturesDir(projectPath: string): string {
    return getFeaturesDir(projectPath);
  }

  /**
   * Get the images directory path for a feature
   */
  getFeatureImagesDir(projectPath: string, featureId: string): string {
    return getFeatureImagesDir(projectPath, featureId);
  }

  /**
   * Delete images that were removed from a feature
   */
  private async deleteOrphanedImages(
    projectPath: string,
    oldPaths: Array<string | { path: string; [key: string]: unknown }> | undefined,
    newPaths: Array<string | { path: string; [key: string]: unknown }> | undefined
  ): Promise<void> {
    if (!oldPaths || oldPaths.length === 0) {
      return;
    }

    // Build sets of paths for comparison
    const oldPathSet = new Set(oldPaths.map((p) => (typeof p === 'string' ? p : p.path)));
    const newPathSet = new Set((newPaths || []).map((p) => (typeof p === 'string' ? p : p.path)));

    // Find images that were removed
    for (const oldPath of oldPathSet) {
      if (!newPathSet.has(oldPath)) {
        try {
          // Paths are now absolute
          await secureFs.unlink(oldPath);
          logger.info(`Deleted orphaned image: ${oldPath}`);
        } catch (error) {
          // Ignore errors when deleting (file may already be gone)
          logger.warn(`Failed to delete image: ${oldPath}`, error);
        }
      }
    }
  }

  /**
   * Copy images from temp directory to feature directory and update paths
   */
  private async migrateImages(
    projectPath: string,
    featureId: string,
    imagePaths?: Array<string | { path: string; [key: string]: unknown }>
  ): Promise<Array<string | { path: string; [key: string]: unknown }> | undefined> {
    if (!imagePaths || imagePaths.length === 0) {
      return imagePaths;
    }

    const featureImagesDir = this.getFeatureImagesDir(projectPath, featureId);
    await secureFs.mkdir(featureImagesDir, { recursive: true });

    const updatedPaths: Array<string | { path: string; [key: string]: unknown }> = [];

    for (const imagePath of imagePaths) {
      try {
        const originalPath = typeof imagePath === 'string' ? imagePath : imagePath.path;

        // Skip if already in feature directory (already absolute path in external storage)
        if (originalPath.includes(`/features/${featureId}/images/`)) {
          updatedPaths.push(imagePath);
          continue;
        }

        // Resolve the full path
        const fullOriginalPath = path.isAbsolute(originalPath)
          ? originalPath
          : path.join(projectPath, originalPath);

        // Check if file exists
        try {
          await secureFs.access(fullOriginalPath);
        } catch {
          logger.warn(`Image not found, skipping: ${fullOriginalPath}`);
          continue;
        }

        // Get filename and create new path in external storage
        const filename = path.basename(originalPath);
        const newPath = path.join(featureImagesDir, filename);

        // Copy the file
        await secureFs.copyFile(fullOriginalPath, newPath);
        logger.info(`Copied image: ${originalPath} -> ${newPath}`);

        // Try to delete the original temp file
        try {
          await secureFs.unlink(fullOriginalPath);
        } catch {
          // Ignore errors when deleting temp file
        }

        // Update the path in the result (use absolute path)
        if (typeof imagePath === 'string') {
          updatedPaths.push(newPath);
        } else {
          updatedPaths.push({ ...imagePath, path: newPath });
        }
      } catch (error) {
        logger.error(`Failed to migrate image:`, error);
        // Rethrow error to let caller decide how to handle it
        // Keeping original path could lead to broken references
        throw error;
      }
    }

    return updatedPaths;
  }

  /**
   * Get the path to a specific feature folder
   */
  getFeatureDir(projectPath: string, featureId: string): string {
    return getFeatureDir(projectPath, featureId);
  }

  /**
   * Get the path to a feature's feature.json file
   */
  getFeatureJsonPath(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'feature.json');
  }

  /**
   * Get the path to a feature's agent-output.md file
   */
  getAgentOutputPath(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'agent-output.md');
  }

  /**
   * Get the path to a feature's raw-output.jsonl file
   */
  getRawOutputPath(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'raw-output.jsonl');
  }

  /**
   * Generate a new feature ID
   */
  generateFeatureId(): string {
    return `feature-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Derive the git branch prefix from a feature category.
   * Maps semantic categories to conventional-commit-style prefixes.
   */
  branchPrefixForCategory(category: string | undefined): string {
    if (!category) return 'feature';
    const c = category.toLowerCase();
    if (c === 'bug' || c === 'fix' || c === 'bugfix' || c === 'bug-fix' || c === 'hotfix')
      return 'fix';
    if (c === 'ops' || c === 'chore' || c === 'maintenance') return 'chore';
    if (c === 'docs' || c === 'documentation') return 'docs';
    return 'feature';
  }

  /**
   * Generate a branch name from a feature title, feature ID, and optional category.
   * Appends a short fragment derived from the featureId to guarantee
   * uniqueness even when multiple features share a long common title prefix.
   *
   * Category takes priority for prefix selection. When no category is given,
   * the conventional-commit type in the title is used (fix: → fix/, etc.).
   */
  generateBranchName(title: string | undefined, featureId?: string, category?: string): string {
    // Derive a short, deterministic uniqueness suffix from featureId.
    // featureId format: "feature-{timestamp}-{random9chars}"
    // Use the last 7 characters of the id — always alphanumeric, always unique.
    const shortId = featureId ? featureId.slice(-7) : Date.now().toString(36).slice(-7);

    // Category takes priority when it maps to a specific non-default prefix.
    // When the category is unknown or maps to the default "feature" prefix (e.g.
    // "Uncategorized"), fall through to title detection — this prevents the
    // "Uncategorized" default from masking fix(ci): / fixci: / chore(infra): titles and
    // emitting a wrong feature/ prefix (root cause of recurring source-branch CI failures).
    let prefix: string;
    const catPrefix = category ? this.branchPrefixForCategory(category) : null;
    if (catPrefix && catPrefix !== 'feature') {
      prefix = catPrefix;
    } else if (title) {
      // Detect conventional-commit type from title when category doesn't give a specific prefix.
      // Pattern matches: type:, type(scope):, type!:, type(scope)!:
      // Also matches concatenated scope variants: fixci:, choreinfra: (agents sometimes omit parens)
      const ccMatch = title
        .trim()
        .match(
          /^(fix|chore|docs|refactor|test|perf|style|ci|build|revert)([a-z0-9-]{0,15}|\([^)]*\))?!?:/
        );
      if (ccMatch) {
        const type = ccMatch[1];
        if (type === 'fix' || type === 'revert') {
          prefix = 'fix';
        } else if (type === 'chore' || type === 'ci' || type === 'build') {
          prefix = 'chore';
        } else if (type === 'docs') {
          prefix = 'docs';
        } else if (type === 'refactor') {
          prefix = 'refactor';
        } else {
          // test, perf, style → fall back to category default
          prefix = catPrefix ?? 'feature';
        }
      } else {
        prefix = catPrefix ?? 'feature';
      }
    } else {
      prefix = catPrefix ?? 'feature';
    }

    if (!title || !title.trim()) {
      return `${prefix}/untitled-${shortId}`;
    }

    // Keep slug portion to 50 chars so the full branch stays under ~60 chars.
    const slug = slugify(title, 50);
    return `${prefix}/${slug || `untitled`}-${shortId}`;
  }

  /**
   * Get all features for a project
   */
  async getAll(projectPath: string): Promise<Feature[]> {
    debugLog('FeatureLoader', 'getAll called', { projectPath });

    try {
      const featuresDir = this.getFeaturesDir(projectPath);
      debugLog('FeatureLoader', 'Features directory', { featuresDir });

      // Check if features directory exists
      try {
        await secureFs.access(featuresDir);
      } catch {
        debugLog('FeatureLoader', 'Features directory does not exist, returning empty', {
          featuresDir,
        });
        return [];
      }

      // Read all feature directories
      const entries = (await secureFs.readdir(featuresDir, {
        withFileTypes: true,
      })) as Dirent[];
      const featureDirs = entries.filter((entry) => entry.isDirectory());

      // Load all features concurrently with automatic recovery from backups
      const featurePromises = featureDirs.map(async (dir) => {
        const featureId = dir.name;
        const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);
        const backupDir = getFeatureBackupDir(projectPath, featureId);

        // Use recovery-enabled read to handle corrupted files
        const result = await readJsonWithRecovery<Feature | null>(featureJsonPath, null, {
          maxBackups: DEFAULT_BACKUP_COUNT,
          autoRestore: true,
          backupDir,
        });

        logRecoveryWarning(result, `Feature ${featureId}`, logger);

        const feature = result.data;

        if (!feature) {
          return null;
        }

        if (!feature.id) {
          logger.warn(`Feature ${featureId} missing required 'id' field, skipping`);
          return null;
        }

        // Normalize status before returning
        return this.normalizeFeature(feature);
      });

      const results = await Promise.all(featurePromises);
      const features = results.filter((f): f is Feature => f !== null);

      // Sort by creation order (feature IDs contain timestamp)
      features.sort((a, b) => {
        const aTime = a.id ? parseInt(a.id.split('-')[1] || '0') : 0;
        const bTime = b.id ? parseInt(b.id.split('-')[1] || '0') : 0;
        return aTime - bTime;
      });

      debugLog('FeatureLoader', 'getAll returning features', {
        count: features.length,
        projectPath,
        featureIds: features.slice(0, 5).map((f) => f.id), // First 5 for brevity
      });

      return features;
    } catch (error) {
      logger.error('Failed to get all features:', error);
      return [];
    }
  }

  /**
   * Sync Prometheus metrics with current feature state
   * Call this during server initialization to ensure gauges reflect reality
   */
  async syncMetrics(projectPath: string): Promise<void> {
    try {
      const features = await this.getAll(projectPath);
      const statusCounts = new Map<string, number>();

      // Count features by status
      for (const feature of features) {
        const status = feature.status || 'backlog';
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      }

      // Reset gauge and set correct values
      featuresByStatus.reset();
      for (const [status, count] of statusCounts.entries()) {
        featuresByStatus.set({ status }, count);
      }

      logger.info('Synced Prometheus metrics with feature state', {
        totalFeatures: features.length,
        statusCounts: Object.fromEntries(statusCounts),
      });
    } catch (error) {
      logger.error('Failed to sync Prometheus metrics:', error);
    }
  }

  /**
   * Normalize a title for comparison (case-insensitive, trimmed)
   */
  protected normalizeTitle(title: string): string {
    return title.toLowerCase().trim();
  }

  /**
   * Find a feature by its title (case-insensitive match)
   * @param projectPath - Path to the project
   * @param title - Title to search for
   * @returns The matching feature or null if not found
   */
  async findByTitle(projectPath: string, title: string): Promise<Feature | null> {
    if (!title || !title.trim()) {
      return null;
    }

    const normalizedTitle = this.normalizeTitle(title);
    const features = await this.getAll(projectPath);

    for (const feature of features) {
      if (feature.title && this.normalizeTitle(feature.title) === normalizedTitle) {
        return feature;
      }
    }

    return null;
  }

  /**
   * Find a feature by its branch name
   * @param projectPath - Path to the project
   * @param branchName - Git branch name to search for
   * @returns The matching feature or null if not found
   */
  async findByBranchName(projectPath: string, branchName: string): Promise<Feature | null> {
    if (!branchName || !branchName.trim()) {
      return null;
    }

    const features = await this.getAll(projectPath);

    for (const feature of features) {
      if (feature.branchName === branchName) {
        return feature;
      }
    }

    return null;
  }

  /**
   * Find a feature by its PR number
   * @param projectPath - Path to the project
   * @param prNumber - GitHub PR number to search for
   * @returns The matching feature or null if not found
   */
  async findByPRNumber(projectPath: string, prNumber: number): Promise<Feature | null> {
    if (!prNumber) {
      return null;
    }

    const features = await this.getAll(projectPath);

    for (const feature of features) {
      if (feature.prNumber === prNumber) {
        return feature;
      }
    }

    return null;
  }

  /**
   * Check if a title already exists on another active feature (for duplicate detection).
   * Archived features are excluded — delete-then-recreate and archive-then-recreate must work.
   *
   * @param projectPath - Path to the project
   * @param title - Title to check
   * @param excludeFeatureId - Optional feature ID to exclude from the check (for updates)
   * @param epicId - Optional epic ID; when provided only features within the same epic are
   *   considered duplicates. Pass `null` explicitly to restrict matching to top-level features.
   *   When omitted (`undefined`), the epicId dimension is ignored (legacy behaviour).
   * @returns The duplicate active feature if found, null otherwise
   */
  async findDuplicateTitle(
    projectPath: string,
    title: string,
    excludeFeatureId?: string,
    epicId?: string | null | undefined
  ): Promise<Feature | null> {
    if (!title || !title.trim()) {
      return null;
    }

    const normalizedTitle = this.normalizeTitle(title);
    const features = await this.getAll(projectPath);

    for (const feature of features) {
      // Skip the feature being updated (if provided)
      if (excludeFeatureId && feature.id === excludeFeatureId) {
        continue;
      }

      // Skip archived features — they are out of the active uniqueness pool.
      // This allows delete-then-recreate and archive-then-recreate workflows.
      if (feature.archived) {
        continue;
      }

      if (feature.title && this.normalizeTitle(feature.title) === normalizedTitle) {
        // When epicId is explicitly supplied (including null), scope the duplicate check
        // to features that share the same epicId. This prevents false positives when two
        // epics contain child features with the same name.
        if (epicId !== undefined) {
          const featureEpicId = feature.epicId ?? null;
          const searchEpicId = epicId ?? null;
          if (featureEpicId !== searchEpicId) {
            continue;
          }
        }
        return feature;
      }
    }

    return null;
  }

  /**
   * One-shot sweep to detect existing duplicate titles in legacy data and log them for
   * manual review. Duplicates are identified by (normalizedTitle, epicId) tuples across
   * all active (non-archived) features.
   *
   * Call this once at startup or on demand to surface pre-existing duplicates that were
   * created before the idempotent-create guard was in place.
   *
   * @param projectPath - Path to the project
   * @returns Array of duplicate groups found (each group has title + array of feature IDs)
   */
  async detectLegacyDuplicates(
    projectPath: string
  ): Promise<Array<{ title: string; epicId: string | null; featureIds: string[] }>> {
    const features = await this.getAll(projectPath);
    const activeFeatures = features.filter((f) => !f.archived);

    // Group by (normalizedTitle, epicId)
    const groups = new Map<
      string,
      { title: string; epicId: string | null; featureIds: string[] }
    >();

    for (const feature of activeFeatures) {
      if (!feature.title || !feature.id) continue;
      const epicId = feature.epicId ?? null;
      const key = `${this.normalizeTitle(feature.title)}::${epicId ?? ''}`;

      const existing = groups.get(key);
      if (existing) {
        existing.featureIds.push(feature.id);
      } else {
        groups.set(key, { title: feature.title, epicId, featureIds: [feature.id] });
      }
    }

    const duplicates = Array.from(groups.values()).filter((g) => g.featureIds.length > 1);

    if (duplicates.length > 0) {
      logger.warn(`Legacy duplicate features detected (${duplicates.length} groups):`, {
        duplicates: duplicates.map((d) => ({
          title: d.title,
          epicId: d.epicId,
          ids: d.featureIds,
        })),
      });
    }

    return duplicates;
  }

  /**
   * Find a candidate parent epic for auto-adoption based on the feature title's bracket pattern.
   * Loads all features for the project and delegates to the standalone findCandidateEpic function.
   *
   * @param projectPath - Path to the project
   * @param title - Title of the child feature being created
   * @returns The matching epic Feature, or null if no unique match found
   */
  async findCandidateEpicForTitle(projectPath: string, title: string): Promise<Feature | null> {
    const features = await this.getAll(projectPath);
    return findCandidateEpic(title, features);
  }

  /**
   * Get a single feature by ID
   * Uses automatic recovery from backups if the main file is corrupted
   */
  async get(projectPath: string, featureId: string): Promise<Feature | null> {
    const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);
    const backupDir = getFeatureBackupDir(projectPath, featureId);

    // Use recovery-enabled read to handle corrupted files
    const result = await readJsonWithRecovery<Feature | null>(featureJsonPath, null, {
      maxBackups: DEFAULT_BACKUP_COUNT,
      autoRestore: true,
      backupDir,
    });

    logRecoveryWarning(result, `Feature ${featureId}`, logger);

    // Normalize status before returning
    return result.data ? this.normalizeFeature(result.data) : null;
  }

  /**
   * Create a new feature
   */
  async create(projectPath: string, featureData: Partial<Feature>): Promise<Feature> {
    const featureId = featureData.id || this.generateFeatureId();
    const featureDir = this.getFeatureDir(projectPath, featureId);
    const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

    // Ensure automaker directory exists
    await ensureAutomakerDir(projectPath);

    // Create feature directory
    await secureFs.mkdir(featureDir, { recursive: true });

    // Migrate images from temp directory to feature directory
    const migratedImagePaths = await this.migrateImages(
      projectPath,
      featureId,
      featureData.imagePaths
    );

    // Initialize description history with the initial description
    const initialHistory: DescriptionHistoryEntry[] = [];
    if (featureData.description && featureData.description.trim()) {
      initialHistory.push({
        description: featureData.description,
        timestamp: new Date().toISOString(),
        source: 'initial',
      });
    }

    // Read-only features don't need a branch — skip generation entirely.
    // If a branchName is provided by the caller, validate it before use — special characters
    // like `[`, `]`, `(`, `)`, `:` are illegal in git refs and cause worktree creation to fail.
    // Invalid branch names are discarded and regenerated from the title via generateBranchName.
    const branchName =
      featureData.executionMode === 'read-only'
        ? undefined
        : ((featureData.branchName && isValidBranchName(featureData.branchName)
            ? featureData.branchName
            : null) ?? this.generateBranchName(featureData.title, featureId, featureData.category));

    // Auto-assign projectSlug if not already provided
    let resolvedProjectSlug = featureData.projectSlug;
    if (!resolvedProjectSlug && this.projectSlugResolver) {
      const slug = await this.projectSlugResolver.resolveDefaultSlug(projectPath);
      if (slug) {
        resolvedProjectSlug = slug;
        logger.debug(`Auto-assigned projectSlug "${slug}" to new feature ${featureId}`);
      }
    }

    // Set lifecycle timestamps
    const createdAt = new Date().toISOString();
    const initialStatus = (featureData.status || 'backlog') as FeatureStatus;

    // Ensure feature has required fields
    const feature: Feature = {
      category: featureData.category || 'Uncategorized',
      description: featureData.description || '',
      ...featureData,
      id: featureId,
      branchName,
      imagePaths: migratedImagePaths,
      descriptionHistory: initialHistory,
      createdAt,
      statusHistory: [
        {
          from: null,
          to: initialStatus,
          timestamp: createdAt,
          reason: 'Feature created',
        },
      ],
      // Stamp the creating instance ID when multi-instance identity is configured.
      // Caller-supplied createdByInstance takes precedence (e.g. CRDT sync from peer).
      ...(featureData.createdByInstance == null && this.instanceId != null
        ? { createdByInstance: this.instanceId }
        : {}),
      // Apply resolved projectSlug (resolver result takes precedence over featureData when
      // the caller did not supply one, ensuring auto-assignment for all creation paths).
      ...(resolvedProjectSlug != null ? { projectSlug: resolvedProjectSlug } : {}),
    };

    // Write feature.json atomically with backup support
    const backupDir = getFeatureBackupDir(projectPath, featureId);
    await atomicWriteJson(featureJsonPath, feature, {
      backupCount: DEFAULT_BACKUP_COUNT,
      backupDir,
    });

    // Update Prometheus gauge for new feature
    featuresByStatus.inc({ status: initialStatus });

    logger.info(`Created feature ${featureId}`);
    return feature;
  }

  /**
   * Update a feature (partial updates supported)
   * @param projectPath - Path to the project
   * @param featureId - ID of the feature to update
   * @param updates - Partial feature updates
   * @param descriptionHistorySource - Source of description change ('enhance' or 'edit')
   * @param enhancementMode - Enhancement mode if source is 'enhance'
   * @param preEnhancementDescription - Description before enhancement (for restoring original)
   * @param options - Optional flags, e.g. skipEventEmission for batch operations
   */
  async update(
    projectPath: string,
    featureId: string,
    updates: Partial<Feature>,
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
    preEnhancementDescription?: string,
    options?: { skipEventEmission?: boolean }
  ): Promise<Feature> {
    const feature = await this.get(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Reject contradictory epic state when isEpic or epicId fields are being modified.
    // Only checked when the update touches these fields to allow other updates (e.g. status)
    // to proceed even on features already in contradictory state (handled by the scheduler).
    if (updates.isEpic !== undefined || updates.epicId !== undefined) {
      const effectiveIsEpic = updates.isEpic !== undefined ? updates.isEpic : feature.isEpic;
      const effectiveEpicId = updates.epicId !== undefined ? updates.epicId : feature.epicId;
      if (effectiveIsEpic && effectiveEpicId) {
        throw new Error(
          'A feature cannot be both an epic (isEpic: true) and a member of another epic (epicId set). Set either isEpic or epicId, not both.'
        );
      }
    }

    // Handle image path changes
    let updatedImagePaths = updates.imagePaths;
    if (updates.imagePaths !== undefined) {
      // Delete orphaned images (images that were removed)
      await this.deleteOrphanedImages(projectPath, feature.imagePaths, updates.imagePaths);

      // Migrate any new images
      updatedImagePaths = await this.migrateImages(projectPath, featureId, updates.imagePaths);
    }

    // Track description history if description changed
    let updatedHistory = feature.descriptionHistory || [];
    if (
      updates.description !== undefined &&
      updates.description !== feature.description &&
      updates.description.trim()
    ) {
      const timestamp = new Date().toISOString();

      // If this is an enhancement and we have the pre-enhancement description,
      // add the original text to history first (so user can restore to it)
      if (
        descriptionHistorySource === 'enhance' &&
        preEnhancementDescription &&
        preEnhancementDescription.trim()
      ) {
        // Check if this pre-enhancement text is different from the last history entry
        const lastEntry = updatedHistory[updatedHistory.length - 1];
        if (!lastEntry || lastEntry.description !== preEnhancementDescription) {
          const preEnhanceEntry: DescriptionHistoryEntry = {
            description: preEnhancementDescription,
            timestamp,
            source: updatedHistory.length === 0 ? 'initial' : 'edit',
          };
          updatedHistory = [...updatedHistory, preEnhanceEntry];
        }
      }

      // Add the new/enhanced description to history
      const historyEntry: DescriptionHistoryEntry = {
        description: updates.description,
        timestamp,
        source: descriptionHistorySource || 'edit',
        ...(descriptionHistorySource === 'enhance' && enhancementMode ? { enhancementMode } : {}),
      };
      updatedHistory = [...updatedHistory, historyEntry];
    }

    // Track status history and lifecycle timestamps if status changed
    let updatedStatusHistory = feature.statusHistory || [];
    let lifecycleUpdates = {};
    if (updates.status !== undefined && updates.status !== feature.status) {
      const timestamp = new Date().toISOString();

      // Add status transition to history
      const transition: StatusTransition = {
        from: (feature.status as FeatureStatus) ?? null,
        to: updates.status as FeatureStatus,
        timestamp,
        ...(typeof updates.statusChangeReason === 'string'
          ? { reason: updates.statusChangeReason }
          : {}),
      };
      updatedStatusHistory = [...updatedStatusHistory, transition];

      // Update Prometheus gauge for status change
      if (feature.status) {
        featuresByStatus.dec({ status: feature.status });
      }
      featuresByStatus.inc({ status: updates.status });

      // Set lifecycle timestamps based on status
      if (updates.status === 'review' && !feature.reviewStartedAt) {
        lifecycleUpdates = { ...lifecycleUpdates, reviewStartedAt: timestamp };
      } else if (
        (updates.status === 'done' || updates.status === 'verified') &&
        !feature.completedAt
      ) {
        lifecycleUpdates = { ...lifecycleUpdates, completedAt: timestamp };
      }
    }

    // Merge updates
    const updatedFeature: Feature = {
      ...feature,
      ...updates,
      ...(updatedImagePaths !== undefined ? { imagePaths: updatedImagePaths } : {}),
      descriptionHistory: updatedHistory,
      statusHistory: updatedStatusHistory,
      ...lifecycleUpdates,
    };

    // Write back to file atomically with backup support
    const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);
    const backupDir = getFeatureBackupDir(projectPath, featureId);
    await atomicWriteJson(featureJsonPath, updatedFeature, {
      backupCount: DEFAULT_BACKUP_COUNT,
      backupDir,
    });

    // Auto-emit feature:status-changed when status changes (persist-before-emit ordering)
    if (
      updates.status !== undefined &&
      updates.status !== feature.status &&
      this.events &&
      !options?.skipEventEmission
    ) {
      this.events.broadcast('feature:status-changed', {
        featureId,
        projectPath,
        oldStatus: feature.status,
        previousStatus: feature.status, // backward-compat alias
        newStatus: updates.status,
        reason:
          typeof updates.statusChangeReason === 'string'
            ? updates.statusChangeReason
            : 'status updated',
        feature: updatedFeature,
      });

      // Publish to TopicBus (hierarchical routing, coexists with EventEmitter)
      if (this.topicBus) {
        this.topicBus.publish(`feature.status.${featureId}`, {
          featureId,
          projectPath,
          oldStatus: feature.status,
          newStatus: updates.status,
          reason:
            typeof updates.statusChangeReason === 'string'
              ? updates.statusChangeReason
              : 'status updated',
        });
      }

      // Emit specific lifecycle events based on new status
      const lifecyclePayload = {
        featureId,
        featureTitle: updatedFeature.title,
        projectPath,
        previousStatus: feature.status,
        newStatus: updates.status,
      };
      if (updates.status === 'in_progress') {
        this.events.broadcast('feature:started', lifecyclePayload);
      } else if (updates.status === 'blocked') {
        this.events.broadcast('feature:blocked', lifecyclePayload);
      } else if (updates.status === 'done') {
        this.events.broadcast('feature:stopped', lifecyclePayload);
      }
    }

    // Epic completion is handled by CompletionDetectorService which listens to
    // feature:status-changed events. It creates an epic-to-dev PR and moves the
    // epic to review, rather than marking it done prematurely.

    logger.info(`Updated feature ${featureId}`);
    return updatedFeature;
  }

  /**
   * Reset a feature to backlog status and clear all stale execution context.
   *
   * In addition to updating the feature status, this method removes three categories
   * of stale files that would otherwise cause the next agent dispatch to resume
   * from stale state (ghost-PR loop, wrong pipeline phase, stale checkpoint):
   *   - .automaker/checkpoints/{featureId}.json   — pipeline state machine checkpoint
   *   - .automaker/features/{featureId}/handoff-*.json — phase handoff documents
   *   - .automaker/features/{featureId}/agent-output.md  — live session output
   *
   * All cleanup operations are best-effort: failures are logged but never thrown so
   * that the status update is never blocked by a missing file.
   *
   * @param projectPath - Absolute path to the project root
   * @param featureId   - Feature identifier
   * @param reason      - Human-readable reason for the reset (stored as statusChangeReason)
   */
  async resetToBacklog(
    projectPath: string,
    featureId: string,
    reason = 'Reset by operator — prior blocker resolved'
  ): Promise<Feature> {
    const updated = await this.update(projectPath, featureId, {
      status: 'backlog',
      statusChangeReason: reason,
      startedAt: undefined,
    });

    // 1. Clear pipeline state machine checkpoint
    const checkpointPath = path.join(
      getAutomakerDir(projectPath),
      'checkpoints',
      `${featureId}.json`
    );
    try {
      await secureFs.unlink(checkpointPath);
      logger.info(`[RESET] Cleared checkpoint for ${featureId}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`[RESET] Failed to clear checkpoint for ${featureId}:`, err);
      }
    }

    // 2. Rename agent-output.md to .stale (prevents stale-context resume trap)
    const featureDir = this.getFeatureDir(projectPath, featureId);
    const agentOutputPath = path.join(featureDir, 'agent-output.md');
    try {
      await secureFs.access(agentOutputPath);
      await secureFs.rename(agentOutputPath, `${agentOutputPath}.stale`);
      logger.info(`[RESET] Renamed agent-output.md to .stale for ${featureId}`);
    } catch {
      // File doesn't exist — nothing to rename
    }

    // 3. Rename handoff-*.json to .stale (prevents pipeline from resuming stale phase)
    try {
      const entries = (await secureFs.readdir(featureDir, { withFileTypes: true })) as Dirent[];
      for (const entry of entries) {
        if (entry.isFile() && entry.name.startsWith('handoff-') && entry.name.endsWith('.json')) {
          const filePath = path.join(featureDir, entry.name);
          await secureFs.rename(filePath, `${filePath}.stale`);
          logger.info(`[RESET] Renamed ${entry.name} to .stale for ${featureId}`);
        }
      }
    } catch {
      // Feature directory may not exist — nothing to rename
    }

    return updated;
  }

  /**
   * Delete a feature
   */
  async delete(projectPath: string, featureId: string): Promise<boolean> {
    try {
      // Get feature status before deleting for metrics
      const feature = await this.get(projectPath, featureId);
      const featureStatus = feature?.status;

      const featureDir = this.getFeatureDir(projectPath, featureId);
      await secureFs.rm(featureDir, { recursive: true, force: true });
      logger.info(`Deleted feature ${featureId}`);

      // Update Prometheus gauge for deleted feature
      if (featureStatus) {
        featuresByStatus.dec({ status: featureStatus });
      }

      // Notify integrity watchdog so it doesn't flag this as data loss
      if (this.integrityWatchdog) {
        await this.integrityWatchdog.notifyFeatureDeleted(projectPath);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to delete feature ${featureId}:`, error);
      return false;
    }
  }

  /**
   * Archive a feature by moving its directory to .automaker/archive/{featureId}/.
   *
   * Copies feature.json, agent-output.md, and handoff-*.json files to the archive
   * directory, then removes the original feature directory. A minimal stub is
   * written back to the original feature.json path so that FeatureLoader.get()
   * can return an archived indicator without treating the feature as missing.
   *
   * The stub always includes `status: "done"` and the original `title` so that
   * downstream consumers (e.g. LE state machine) recognise the feature as
   * completed rather than an invalid or unknown work item.
   *
   * @param projectPath - Absolute path to the project root
   * @param featureId   - Feature identifier
   * @returns Absolute path to the archive directory
   */
  async archiveFeature(projectPath: string, featureId: string): Promise<string> {
    const featureDir = this.getFeatureDir(projectPath, featureId);
    const archiveDir = path.join(getAutomakerDir(projectPath), 'archive', featureId);

    // Create the archive directory
    await secureFs.mkdir(archiveDir, { recursive: true });

    const archivedAt = new Date().toISOString();

    // 1. Always copy feature.json (full — contains statusHistory, executionHistory, etc.)
    try {
      await secureFs.copyFile(
        path.join(featureDir, 'feature.json'),
        path.join(archiveDir, 'feature.json')
      );
    } catch {
      // If feature.json is missing, continue — stub will still be written
    }

    // 2. Copy agent-output.md if present
    try {
      await secureFs.copyFile(
        path.join(featureDir, 'agent-output.md'),
        path.join(archiveDir, 'agent-output.md')
      );
    } catch {
      // File may not exist — that's fine
    }

    // 3. Copy handoff-*.json files
    try {
      const entries = (await secureFs.readdir(featureDir, { withFileTypes: true })) as Dirent[];
      for (const entry of entries) {
        if (entry.isFile() && entry.name.startsWith('handoff-') && entry.name.endsWith('.json')) {
          try {
            await secureFs.copyFile(
              path.join(featureDir, entry.name),
              path.join(archiveDir, entry.name)
            );
          } catch {
            logger.warn(`Could not copy handoff file ${entry.name} for feature ${featureId}`);
          }
        }
      }
    } catch {
      // Directory unreadable — skip
    }

    // 4. Delete the feature's backup directory (operational only, not needed post-archive)
    try {
      const backupDir = getFeatureBackupDir(projectPath, featureId);
      await secureFs.rm(backupDir, { recursive: true, force: true });
    } catch {
      // Not critical if backup cleanup fails
    }

    // 5. Get the feature now (before deletion) so we can include title in the stub
    const featureForStatus = await this.get(projectPath, featureId);
    const statusBeforeArchive = featureForStatus?.status;

    // 6. Delete the entire original feature directory
    await secureFs.rm(featureDir, { recursive: true, force: true });

    // 7. Re-create the feature directory with a minimal archived stub.
    //    Always include status: "done" and title so consumers (e.g. LE state machine)
    //    can recognise this as a completed feature without treating it as an invalid stub.
    await secureFs.mkdir(featureDir, { recursive: true });
    const stub = {
      id: featureId,
      archived: true,
      archivedAt,
      archivePath: archiveDir,
      status: 'done' as FeatureStatus,
      title: featureForStatus?.title ?? '',
    };
    await secureFs.writeFile(
      path.join(featureDir, 'feature.json'),
      JSON.stringify(stub, null, 2),
      'utf-8'
    );

    // 8. Update Prometheus gauge — the feature is no longer in its pre-archive status
    if (statusBeforeArchive) {
      featuresByStatus.dec({ status: statusBeforeArchive });
    }

    // 9. Notify integrity watchdog — stub still exists, so no data-loss alert needed
    if (this.integrityWatchdog) {
      await this.integrityWatchdog.notifyFeatureDeleted(projectPath);
    }

    logger.info(`Archived feature ${featureId} → ${archiveDir}`);
    return archiveDir;
  }

  /**
   * Get agent output for a feature
   */
  async getAgentOutput(projectPath: string, featureId: string): Promise<string | null> {
    try {
      const agentOutputPath = this.getAgentOutputPath(projectPath, featureId);
      const content = (await secureFs.readFile(agentOutputPath, 'utf-8')) as string;
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to get agent output for ${featureId}:`, error);
      throw error;
    }
  }

  /**
   * Get raw output for a feature (JSONL format for debugging)
   */
  async getRawOutput(projectPath: string, featureId: string): Promise<string | null> {
    try {
      const rawOutputPath = this.getRawOutputPath(projectPath, featureId);
      const content = (await secureFs.readFile(rawOutputPath, 'utf-8')) as string;
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to get raw output for ${featureId}:`, error);
      throw error;
    }
  }

  /**
   * Save agent output for a feature
   */
  async saveAgentOutput(projectPath: string, featureId: string, content: string): Promise<void> {
    const featureDir = this.getFeatureDir(projectPath, featureId);
    await secureFs.mkdir(featureDir, { recursive: true });

    const agentOutputPath = this.getAgentOutputPath(projectPath, featureId);
    await secureFs.writeFile(agentOutputPath, content, 'utf-8');
  }

  /**
   * Delete agent output for a feature
   */
  async deleteAgentOutput(projectPath: string, featureId: string): Promise<void> {
    try {
      const agentOutputPath = this.getAgentOutputPath(projectPath, featureId);
      await secureFs.unlink(agentOutputPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Sync a completed feature to the app_spec.txt implemented_features section
   *
   * When a feature is completed, this method adds it to the implemented_features
   * section of the project's app_spec.txt file. This keeps the spec in sync
   * with the actual state of the codebase.
   *
   * @param projectPath - Path to the project
   * @param feature - The feature to sync (must have title or description)
   * @param fileLocations - Optional array of file paths where the feature was implemented
   * @returns True if the spec was updated, false if no spec exists or feature was skipped
   */
  async syncFeatureToAppSpec(
    projectPath: string,
    feature: Feature,
    fileLocations?: string[]
  ): Promise<boolean> {
    try {
      const appSpecPath = getAppSpecPath(projectPath);

      // Read the current app_spec.txt
      let specContent: string;
      try {
        specContent = (await secureFs.readFile(appSpecPath, 'utf-8')) as string;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          logger.info(`No app_spec.txt found for project, skipping sync for feature ${feature.id}`);
          return false;
        }
        throw error;
      }

      // Build the implemented feature entry
      const featureName = feature.title || `Feature: ${feature.id}`;
      const implementedFeature: ImplementedFeature = {
        name: featureName,
        description: feature.description,
        ...(fileLocations && fileLocations.length > 0 ? { file_locations: fileLocations } : {}),
      };

      // Add the feature to the implemented_features section
      const updatedSpecContent = addImplementedFeature(specContent, implementedFeature);

      // Check if the content actually changed (feature might already exist)
      if (updatedSpecContent === specContent) {
        logger.info(`Feature "${featureName}" already exists in app_spec.txt, skipping`);
        return false;
      }

      // Write the updated spec back to the file
      await secureFs.writeFile(appSpecPath, updatedSpecContent, 'utf-8');

      logger.info(`Synced feature "${featureName}" to app_spec.txt`);
      return true;
    } catch (error) {
      logger.error(`Failed to sync feature ${feature.id} to app_spec.txt:`, error);
      throw error;
    }
  }

  /**
   * Atomically claim a feature for an instance.
   * Returns true if successfully claimed (was unclaimed or claimed by same instance).
   * Returns false if already claimed by a different instance.
   */
  async claim(projectPath: string, featureId: string, instanceId: string): Promise<boolean> {
    const feature = await this.get(projectPath, featureId);
    if (!feature) return false;

    if (feature.claimedBy && feature.claimedBy !== instanceId) {
      return false;
    }

    await this.update(projectPath, featureId, { claimedBy: instanceId });
    return true;
  }

  /**
   * Release a claimed feature back to the pool.
   */
  async release(projectPath: string, featureId: string): Promise<void> {
    const feature = await this.get(projectPath, featureId);
    if (!feature) return;

    await this.update(projectPath, featureId, { claimedBy: undefined });
  }

  /**
   * Detect features whose branchName points to a non-existent git branch (orphaned features).
   *
   * A feature is considered orphaned when it has a non-null `branchName` but the
   * corresponding git branch no longer exists in the repository.
   *
   * @param projectPath - Path to the project root (git repository)
   * @param preloadedFeatures - Optional pre-loaded features to avoid redundant disk reads
   * @returns Array of features whose branchName points to a non-existent branch
   */
  async detectOrphanedFeatures(
    projectPath: string,
    preloadedFeatures?: Feature[]
  ): Promise<Feature[]> {
    const features = preloadedFeatures ?? (await this.getAll(projectPath));
    // Only check features that have been worked on (in_progress, review, blocked).
    // Skip done — branch deletion after PR merge is normal.
    // Skip backlog — branches are created when agents start, not at feature creation.
    // Skip epics whose children are all done — epic branches may never have been created
    // when features PR directly to dev instead of the epic branch.
    const nonOrphanStatuses = new Set(['done', 'backlog']);
    const doneChildIds = new Set(
      features.filter((f) => f.status === 'done' && f.epicId).map((f) => f.epicId!)
    );
    const featuresWithBranch = features.filter(
      (f) =>
        f.branchName &&
        !nonOrphanStatuses.has(f.status ?? 'backlog') &&
        !(
          f.isEpic &&
          doneChildIds.has(f.id) &&
          !features.some((c) => c.epicId === f.id && c.status !== 'done')
        )
    );

    if (featuresWithBranch.length === 0) {
      return [];
    }

    const orphaned: Feature[] = [];

    for (const feature of featuresWithBranch) {
      const exists = await this.branchExists(projectPath, feature.branchName!);
      if (!exists) {
        orphaned.push(feature);
      }
    }

    return orphaned;
  }

  /**
   * Check whether a git branch exists in the project repository.
   *
   * @param projectPath - Path to the git repository root
   * @param branchName - Branch name to verify (e.g. "feature/my-feature")
   * @returns True if the branch ref can be resolved, false otherwise
   */
  private async branchExists(projectPath: string, branchName: string): Promise<boolean> {
    try {
      await execAsync(`git rev-parse --verify "${branchName}"`, { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }
}
