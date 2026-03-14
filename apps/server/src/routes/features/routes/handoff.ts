/**
 * POST /handoff endpoint - Read handoff files for a feature
 *
 * Reads handoff-*.json files from .automaker/features/{featureId}/
 * and returns the latest one by createdAt timestamp.
 *
 * The MCP tool previously read these directly from disk, which breaks
 * when the server runs in Docker (files are inside the container).
 */

import type { Request, Response } from 'express';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { getFeatureDir } from '@protolabsai/platform';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('HandoffRoute');

export const HandoffRequestSchema = z.object({
  projectPath: z.string().min(1),
  featureId: z.string().min(1),
});

export function createHandoffHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const { projectPath, featureId } = req.body;
    const featureDir = getFeatureDir(projectPath, featureId);

    let files: string[] = [];
    try {
      const entries = await readdir(featureDir);
      files = entries.filter((f) => f.startsWith('handoff-') && f.endsWith('.json'));
    } catch {
      res.json({ success: true, handoff: null, message: 'No handoffs found for this feature' });
      return;
    }

    if (files.length === 0) {
      res.json({ success: true, handoff: null, message: 'No handoffs found for this feature' });
      return;
    }

    let latest: Record<string, unknown> | null = null;
    for (const file of files) {
      try {
        const content = await readFile(path.join(featureDir, file), 'utf-8');
        const handoff = JSON.parse(content) as Record<string, unknown>;
        if (
          !latest ||
          new Date(handoff.createdAt as string) > new Date(latest.createdAt as string)
        ) {
          latest = handoff;
        }
      } catch (err) {
        logger.warn(`Skipping corrupt handoff file ${file}:`, err);
      }
    }

    res.json({ success: true, handoff: latest });
  };
}
