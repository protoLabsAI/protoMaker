/**
 * Core tool types for the unified tool package
 */

import type { Feature, FeatureStatus } from '@automaker/types';

/**
 * Tool execution context - dependency injection container
 */
export interface ToolContext {
  featureLoader: {
    getAll: (projectPath: string) => Promise<Feature[]>;
    get: (projectPath: string, featureId: string) => Promise<Feature | null>;
    create: (projectPath: string, feature: Partial<Feature>) => Promise<Feature>;
    update: (
      projectPath: string,
      featureId: string,
      updates: Partial<Feature>,
      metadata?: Record<string, unknown>
    ) => Promise<Feature | null>;
    delete: (projectPath: string, featureId: string) => Promise<boolean>;
    findDuplicateTitle: (
      projectPath: string,
      title: string,
      excludeId?: string
    ) => Promise<Feature | null>;
  };
  events?: {
    emit: (event: string, data: unknown) => void;
  };
}

/**
 * Tool result - standardized response format
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

/**
 * List features input
 */
export interface ListFeaturesInput {
  projectPath: string;
  status?: FeatureStatus;
  compact?: boolean;
}

/**
 * List features output
 */
export interface ListFeaturesOutput {
  features: Feature[] | CompactFeature[];
}

/**
 * Compact feature representation for reduced context usage
 */
export interface CompactFeature {
  id: string;
  title?: string;
  status?: FeatureStatus | string;
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  branchName?: string;
  costUsd?: number;
  prNumber?: number;
  prUrl?: string;
  epicId?: string;
  isEpic?: boolean;
  assignee?: string | null;
  dependencies?: string[];
  updatedAt?: unknown;
}

/**
 * Get feature input
 */
export interface GetFeatureInput {
  projectPath: string;
  featureId: string;
}

/**
 * Get feature output
 */
export interface GetFeatureOutput {
  feature: Feature;
}

/**
 * Create feature input
 */
export interface CreateFeatureInput {
  projectPath: string;
  feature: Partial<Feature>;
}

/**
 * Create feature output
 */
export interface CreateFeatureOutput {
  feature: Feature;
}

/**
 * Update feature input
 */
export interface UpdateFeatureInput {
  projectPath: string;
  featureId: string;
  updates: Partial<Feature>;
}

/**
 * Update feature output
 */
export interface UpdateFeatureOutput {
  feature: Feature;
}

/**
 * Delete feature input
 */
export interface DeleteFeatureInput {
  projectPath: string;
  featureId: string;
}

/**
 * Delete feature output
 */
export interface DeleteFeatureOutput {
  success: boolean;
}
