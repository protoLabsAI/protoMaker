/**
 * POST /api/git/enhanced-status endpoint
 * Returns per-file git status with index status, work tree status, conflict markers, and line counts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

interface FileStatus {
  filePath: string;
  indexStatus: string;
  workTreeStatus: string;
  isConflicted: boolean;
  isStaged: boolean;
  linesAdded: number;
  linesRemoved: number;
  statusLabel: string;
}

function getStatusLabel(index: string, workTree: string): string {
  if (index === '?' && workTree === '?') return 'untracked';
  if (index === 'A') return 'added';
  if (index === 'D' || workTree === 'D') return 'deleted';
  if (index === 'M' || workTree === 'M') return 'modified';
  if (index === 'R') return 'renamed';
  if (index === 'C') return 'copied';
  if (index === 'U' || workTree === 'U') return 'conflict';
  return 'modified';
}

export function createEnhancedStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      try {
        const [statusResult, numstatResult] = await Promise.all([
          execAsync('git status --porcelain=v1 -z', { cwd: projectPath }),
          execAsync('git diff --numstat HEAD', { cwd: projectPath }),
        ]);

        // Parse porcelain status output (NUL-separated for safe handling of spaces)
        const statusMap = new Map<string, { index: string; workTree: string }>();
        const entries = statusResult.stdout.split('\0').filter(Boolean);

        for (const entry of entries) {
          if (entry.length < 3) continue;
          const index = entry[0];
          const workTree = entry[1];
          const filePath = entry.slice(3);
          // For renames, take the destination path (after ->)
          const actualPath = filePath.includes('\0') ? filePath.split('\0')[1] : filePath;
          statusMap.set(actualPath.trim(), { index, workTree });
        }

        // Parse numstat for line counts
        const lineCountMap = new Map<string, { added: number; removed: number }>();
        for (const line of numstatResult.stdout.split('\n').filter(Boolean)) {
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const added = parseInt(parts[0], 10) || 0;
            const removed = parseInt(parts[1], 10) || 0;
            const file = parts[2];
            lineCountMap.set(file, { added, removed });
          }
        }

        const files: FileStatus[] = [];
        for (const [filePath, { index, workTree }] of statusMap) {
          const counts = lineCountMap.get(filePath) ?? { added: 0, removed: 0 };
          files.push({
            filePath,
            indexStatus: index.trim(),
            workTreeStatus: workTree.trim(),
            isConflicted: index === 'U' || workTree === 'U' || (index === 'A' && workTree === 'A'),
            isStaged: index.trim() !== '' && index.trim() !== '?',
            linesAdded: counts.added,
            linesRemoved: counts.removed,
            statusLabel: getStatusLabel(index.trim(), workTree.trim()),
          });
        }

        res.json({ success: true, files });
      } catch (innerError) {
        logError(innerError, 'Git enhanced status failed');
        res.json({ success: true, files: [] });
      }
    } catch (error) {
      logError(error, 'Enhanced status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
