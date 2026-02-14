/**
 * FeatureStore interface — pluggable storage abstraction for features.
 *
 * Extracted from FeatureLoader's public API. The current filesystem-based
 * FeatureLoader implements this interface. Future implementations (SQLite,
 * Postgres, network) can be swapped in for hivemind distribution.
 */

import type { Feature, FeatureStatus } from './feature.js';

export interface FeatureStore {
  /** Get all features for a project */
  getAll(projectPath: string): Promise<Feature[]>;

  /** Get a single feature by ID, or null if not found */
  get(projectPath: string, featureId: string): Promise<Feature | null>;

  /** Find a feature by exact title match */
  findByTitle(projectPath: string, title: string): Promise<Feature | null>;

  /** Create a new feature, returns the created feature with generated ID */
  create(projectPath: string, featureData: Partial<Feature>): Promise<Feature>;

  /** Update an existing feature, returns the updated feature */
  update(projectPath: string, featureId: string, updates: Partial<Feature>): Promise<Feature>;

  /** Delete a feature, returns true if deleted */
  delete(projectPath: string, featureId: string): Promise<boolean>;

  /**
   * Atomically claim a feature for an instance.
   * Returns true if successfully claimed (was unclaimed or claimed by same instance).
   * Returns false if already claimed by a different instance.
   */
  claim(projectPath: string, featureId: string, instanceId: string): Promise<boolean>;

  /** Release a claimed feature back to the pool */
  release(projectPath: string, featureId: string): Promise<void>;
}
