/**
 * Briefing Cursor Service - Tracks when briefings were last delivered per project
 *
 * Maintains a cursor file at {DATA_DIR}/briefing-cursor.json with timestamps
 * indicating when each project last received a briefing. This prevents
 * duplicate event delivery and allows "since last session" briefing queries.
 */

import * as path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('BriefingCursorService');

/**
 * Schema for briefing cursor storage
 */
export interface BriefingCursors {
  cursors: {
    [projectPath: string]: {
      lastBriefedAt: string; // ISO timestamp
    };
  };
}

/**
 * Default empty cursor state
 */
const DEFAULT_CURSORS: BriefingCursors = {
  cursors: {},
};

/**
 * BriefingCursorService - Manages briefing cursor state
 */
export class BriefingCursorService {
  private cursorFilePath: string;

  constructor(dataDir: string) {
    this.cursorFilePath = path.join(dataDir, 'briefing-cursor.json');
  }

  /**
   * Get the last briefed timestamp for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns ISO timestamp of last briefing, or null if never briefed
   */
  async getCursor(projectPath: string): Promise<string | null> {
    const cursors = await this.readCursors();
    return cursors.cursors[projectPath]?.lastBriefedAt ?? null;
  }

  /**
   * Set the last briefed timestamp for a project
   *
   * @param projectPath - Absolute path to project directory
   * @param timestamp - ISO timestamp to record
   */
  async setCursor(projectPath: string, timestamp: string): Promise<void> {
    const cursors = await this.readCursors();

    cursors.cursors[projectPath] = {
      lastBriefedAt: timestamp,
    };

    await this.writeCursors(cursors);
    logger.info(`Updated briefing cursor for ${projectPath} to ${timestamp}`);
  }

  /**
   * Read cursor file with fallback to default
   */
  private async readCursors(): Promise<BriefingCursors> {
    try {
      const content = (await secureFs.readFile(this.cursorFilePath, 'utf-8')) as string;
      return JSON.parse(content) as BriefingCursors;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return DEFAULT_CURSORS;
      }
      logger.error('Error reading briefing cursor file:', error);
      return DEFAULT_CURSORS;
    }
  }

  /**
   * Write cursor file atomically
   */
  private async writeCursors(cursors: BriefingCursors): Promise<void> {
    const tempPath = `${this.cursorFilePath}.tmp.${Date.now()}`;
    const content = JSON.stringify(cursors, null, 2);

    try {
      await secureFs.writeFile(tempPath, content, 'utf-8');
      await secureFs.rename(tempPath, this.cursorFilePath);
    } catch (error) {
      try {
        await secureFs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}

// Singleton instance
let briefingCursorServiceInstance: BriefingCursorService | null = null;

/**
 * Get the singleton briefing cursor service instance
 *
 * @param dataDir - Data directory path (required on first call)
 * @returns Singleton instance
 */
export function getBriefingCursorService(dataDir?: string): BriefingCursorService {
  if (!briefingCursorServiceInstance) {
    if (!dataDir) {
      throw new Error('dataDir is required on first call to getBriefingCursorService');
    }
    briefingCursorServiceInstance = new BriefingCursorService(dataDir);
  }
  return briefingCursorServiceInstance;
}
