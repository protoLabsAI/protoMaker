/**
 * ProjectTimelineService — append-only ceremony timeline for projects.
 *
 * Entries are stored at:
 *   {projectPath}/.automaker/projects/{slug}/timeline.json
 *
 * The file is append-only: entries are never deleted or modified.
 * Writes are atomic (write to temp file, then rename).
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import { getProjectDir } from '@protolabsai/platform';
import type {
  TimelineEntry,
  TimelineEntryType,
  TimelineEntryAuthor,
  ProjectTimelineFile,
} from '@protolabsai/types';

const logger = createLogger('ProjectTimelineService');

const TIMELINE_FILE = 'timeline.json';

function getTimelinePath(projectPath: string, slug: string): string {
  return path.join(getProjectDir(projectPath, slug), TIMELINE_FILE);
}

export class ProjectTimelineService {
  /**
   * Append a new entry to the project timeline.
   *
   * @returns The newly created TimelineEntry (with generated id and timestamp)
   */
  async appendEntry(
    projectPath: string,
    slug: string,
    entry: Omit<TimelineEntry, 'id' | 'timestamp'>
  ): Promise<TimelineEntry> {
    const newEntry: TimelineEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    const timelinePath = getTimelinePath(projectPath, slug);

    // Ensure project dir exists
    await fs.promises.mkdir(path.dirname(timelinePath), { recursive: true });

    // Read existing timeline (or empty)
    const timeline = await this._readTimeline(timelinePath);
    timeline.entries.push(newEntry);

    // Atomic write: temp file → rename
    const tmpFile = path.join(os.tmpdir(), `timeline-${randomUUID()}.json`);
    await fs.promises.writeFile(tmpFile, JSON.stringify(timeline, null, 2), 'utf-8');
    await fs.promises.rename(tmpFile, timelinePath);

    logger.debug(
      `Appended timeline entry ${newEntry.id} (type=${newEntry.type}) for project ${slug}`
    );
    return newEntry;
  }

  /**
   * Retrieve paginated timeline entries for a project.
   *
   * @returns Paginated result with entries in reverse-chronological order
   */
  async getTimeline(
    projectPath: string,
    slug: string,
    options?: { page?: number; limit?: number }
  ): Promise<{ entries: TimelineEntry[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

    const timelinePath = getTimelinePath(projectPath, slug);
    const timeline = await this._readTimeline(timelinePath);

    const total = timeline.entries.length;
    // Return in reverse-chronological order (newest first)
    const reversed = [...timeline.entries].reverse();
    const start = (page - 1) * limit;
    const entries = reversed.slice(start, start + limit);

    return { entries, total, page, limit };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _readTimeline(timelinePath: string): Promise<ProjectTimelineFile> {
    try {
      const raw = await fs.promises.readFile(timelinePath, 'utf-8');
      return JSON.parse(raw) as ProjectTimelineFile;
    } catch {
      return { version: 1, entries: [] };
    }
  }
}

export const projectTimelineService = new ProjectTimelineService();
