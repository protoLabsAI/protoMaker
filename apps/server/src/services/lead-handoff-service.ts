/**
 * Lead Handoff Service
 *
 * Persists and retrieves PhaseHandoff documents for feature lifecycle phases.
 * Handoffs are stored at:
 *   {projectPath}/.automaker/features/{featureId}/handoff-{phase}.json
 *
 * Each file is written atomically (temp file → rename) to prevent partial reads.
 */

import fs from 'fs/promises';
import { join } from 'path';
import { createLogger } from '@protolabs-ai/utils';
import type { PhaseHandoff, FeatureState } from '@protolabs-ai/types';

const logger = createLogger('LeadHandoffService');

export class LeadHandoffService {
  /**
   * Persist a phase handoff document to disk.
   *
   * @param projectPath - Absolute path to the project root
   * @param featureId   - The feature ID
   * @param handoff     - The PhaseHandoff record to store
   */
  async saveHandoff(projectPath: string, featureId: string, handoff: PhaseHandoff): Promise<void> {
    const dir = join(projectPath, '.automaker', 'features', featureId);
    const filePath = join(dir, `handoff-${handoff.phase}.json`);
    const tempPath = `${filePath}.tmp.${Date.now()}`;

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(tempPath, JSON.stringify(handoff, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);
      logger.info(
        `Handoff saved: feature=${featureId} phase=${handoff.phase} verdict=${handoff.verdict}`
      );
    } catch (error) {
      // Clean up temp file if rename failed
      await fs.unlink(tempPath).catch(() => undefined);
      logger.error(
        `Failed to save handoff for feature=${featureId} phase=${handoff.phase}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Read a phase handoff document from disk.
   *
   * @param projectPath - Absolute path to the project root
   * @param featureId   - The feature ID
   * @param phase       - The lifecycle phase
   * @returns The PhaseHandoff if it exists, or null
   */
  async getHandoff(
    projectPath: string,
    featureId: string,
    phase: FeatureState
  ): Promise<PhaseHandoff | null> {
    const filePath = join(
      projectPath,
      '.automaker',
      'features',
      featureId,
      `handoff-${phase}.json`
    );

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as PhaseHandoff;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to read handoff for feature=${featureId} phase=${phase}:`, error);
      return null;
    }
  }

  /**
   * Return the most recently created handoff across all phases for a feature.
   *
   * @param projectPath - Absolute path to the project root
   * @param featureId   - The feature ID
   * @returns The latest PhaseHandoff by createdAt, or null if none exist
   */
  async getLatestHandoff(projectPath: string, featureId: string): Promise<PhaseHandoff | null> {
    const dir = join(projectPath, '.automaker', 'features', featureId);

    let files: string[];
    try {
      const entries = await fs.readdir(dir);
      files = entries.filter((f) => f.startsWith('handoff-') && f.endsWith('.json'));
    } catch {
      return null;
    }

    if (files.length === 0) return null;

    let latest: PhaseHandoff | null = null;

    for (const file of files) {
      try {
        const content = await fs.readFile(join(dir, file), 'utf-8');
        const handoff = JSON.parse(content) as PhaseHandoff;
        if (!latest || new Date(handoff.createdAt) > new Date(latest.createdAt)) {
          latest = handoff;
        }
      } catch {
        // Skip corrupt files
      }
    }

    return latest;
  }
}
