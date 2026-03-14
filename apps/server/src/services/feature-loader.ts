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

export class FeatureLoader implements FeatureStore {
  private integrityWatchdog: DataIntegrityWatchdogService | null = null;
  private events: EventEmitter | null = null;
  /** Instance ID stamped onto newly created features as createdByInstance */
  private instanceId: string | null = null;
  private projectSlugResolver: ProjectSlugResolver | null = null;

  setIntegrityWatchdog(watchdog: DataIntegrityWatchdogService): void {
    this.integrityWatchdog = watchdog;
  }

  setEventEmitter(events: EventEmitter): void {
    this.events = events;
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
   * Generate a branch name from a feature title
   * Returns a feature/ prefixed branch name suitable for git
   */
  generateBranchName(title: string | undefined): string {
    if (!title || !title.trim()) {
      // Preserve feature/ namespace for untitled features
      return `feature/untitled-${Date.now()}`;
    }
    const slug = slugify(title, 40);
    return `feature/${slug || `untitled-${Date.now()}`}`;
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
   * Check if a title already exists on another feature (for duplicate detection)
   * @param projectPath - Path to the project
   * @param title - Title to check
   * @param excludeFeatureId - Optional feature ID to exclude from the check (for updates)
   * @returns The duplicate feature if found, null otherwise
   */
  async findDuplicateTitle(
    projectPath: string,
    title: string,
    excludeFeatureId?: string
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

      if (feature.title && this.normalizeTitle(feature.title) === normalizedTitle) {
        return feature;
      }
    }

    return null;
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

    // Auto-generate branchName from title if not provided
    const branchName = featureData.branchName || this.generateBranchName(featureData.title);

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

    // Auto-complete epic when all child features reach 'done'
    if (updates.status === 'done' && updatedFeature.epicId) {
      await this.checkAndAutoCompleteEpic(projectPath, updatedFeature.epicId).catch((err) =>
        logger.warn(`Epic auto-completion check failed for epic ${updatedFeature.epicId}:`, err)
      );
    }

    logger.info(`Updated feature ${featureId}`);
    return updatedFeature;
  }

  /**
   * Check if all child features of an epic are done, and if so, auto-complete the epic.
   * Called after any feature transitions to 'done' status.
   *
   * @param projectPath - Path to the project
   * @param epicId - ID of the parent epic to check
   */
  private async checkAndAutoCompleteEpic(projectPath: string, epicId: string): Promise<void> {
    // Get the epic itself
    const epic = await this.get(projectPath, epicId);
    if (!epic) {
      logger.warn(`Epic ${epicId} not found, skipping auto-completion`);
      return;
    }

    // Skip if epic is already done
    if (epic.status === 'done') {
      return;
    }

    // Get all features for this project
    const allFeatures = await this.getAll(projectPath);

    // Find all child features that belong to this epic
    const childFeatures = allFeatures.filter((f) => f.epicId === epicId);

    if (childFeatures.length === 0) {
      // No children — don't auto-complete (epic might be freshly created)
      return;
    }

    // Check if all children are done
    const allDone = childFeatures.every((f) => f.status === 'done');

    if (!allDone) {
      return;
    }

    // All children are done — auto-complete the epic
    logger.info(
      `Auto-completing epic ${epicId} — all ${childFeatures.length} child features are done`
    );

    await this.update(projectPath, epicId, {
      status: 'done',
      statusChangeReason: 'All child features completed',
    });
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
    const featuresWithBranch = features.filter((f) => f.branchName);

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
