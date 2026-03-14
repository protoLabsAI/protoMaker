/**
 * ProjectSlugResolver - Resolves a default project slug for a given projectPath.
 *
 * For single-project installs, returns the sole project slug.
 * For multi-project installs, returns a configurable default or undefined.
 *
 * Projects are stored in {projectPath}/.automaker/projects/{slug}/
 */

import { createLogger } from '@protolabsai/utils';
import { getProjectsDir } from '@protolabsai/platform';
import type { SettingsService } from './settings-service.js';
import * as secureFs from '../lib/secure-fs.js';

const logger = createLogger('ProjectSlugResolver');

export class ProjectSlugResolver {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Resolve the default project slug for the given projectPath.
   *
   * Resolution order:
   * 1. If exactly one project directory exists → return its slug.
   * 2. If multiple projects exist, check GlobalSettings for a `defaultProjectSlug` field.
   * 3. Otherwise → return undefined.
   *
   * @param projectPath - Absolute path to the automaker install root
   * @returns The resolved default slug, or undefined if it cannot be determined
   */
  async resolveDefaultSlug(projectPath: string): Promise<string | undefined> {
    try {
      const projectsDir = getProjectsDir(projectPath);

      // Read project directories — each sub-directory is a project slug
      let entries: import('fs').Dirent[];
      try {
        entries = (await secureFs.readdir(projectsDir, {
          withFileTypes: true,
        })) as import('fs').Dirent[];
      } catch {
        // Projects directory doesn't exist yet — no projects
        logger.debug(`Projects directory not found at ${projectsDir}`);
        return undefined;
      }

      const slugs = entries
        .filter((entry) => entry.isDirectory())
        // Exclude meta directories (e.g. stats.json lives alongside, but only dirs count)
        .map((entry) => entry.name)
        .filter(Boolean);

      if (slugs.length === 0) {
        logger.debug(`No projects found at ${projectsDir}`);
        return undefined;
      }

      // Single-project: unambiguous default
      if (slugs.length === 1) {
        logger.debug(`Single project found: ${slugs[0]}`);
        return slugs[0];
      }

      // Multi-project: check settings for explicit default
      try {
        const globalSettings = await this.settingsService.getGlobalSettings();
        // GlobalSettings does not yet define defaultProjectSlug — access dynamically
        const defaultSlug = (globalSettings as unknown as Record<string, unknown>)[
          'defaultProjectSlug'
        ];
        if (typeof defaultSlug === 'string' && defaultSlug.trim()) {
          logger.debug(`Using configured defaultProjectSlug: ${defaultSlug}`);
          return defaultSlug.trim();
        }
      } catch (err) {
        logger.warn('Failed to read global settings for defaultProjectSlug:', err);
      }

      logger.debug(`Multiple projects found (${slugs.length}), no default configured`);
      return undefined;
    } catch (err) {
      logger.error('Failed to resolve default project slug:', err);
      return undefined;
    }
  }
}
