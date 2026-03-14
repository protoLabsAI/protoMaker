/**
 * Default Settings and Categories
 *
 * Canonical defaults for .automaker/settings.json and categories.json.
 */

import type { DefaultSettings } from './types.js';

/**
 * Get default .automaker/settings.json content.
 */
export function getDefaultSettings(): DefaultSettings {
  return {
    version: 1,
    worktreePanelVisible: false,
  };
}

/**
 * Get default .automaker/categories.json content.
 */
export function getDefaultCategories(): string[] {
  return ['Uncategorized'];
}
