/**
 * StashService — encapsulates git stash command logic for worktrees
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabs-ai/utils';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const logger = createLogger('StashService');

export interface StashEntry {
  ref: string;
  index: number;
  message: string;
  branch: string;
  description: string;
}

export class StashService {
  async push(worktreePath: string, message?: string, files?: string[]): Promise<{ ref: string }> {
    const args = ['stash', 'push'];

    if (message) {
      args.push('-m', message);
    }

    if (files && files.length > 0) {
      args.push('--');
      args.push(...files);
    }

    await execFileAsync('git', args, { cwd: worktreePath });

    // Get the stash ref just created
    const { stdout } = await execAsync('git stash list --format="%gd" -1', {
      cwd: worktreePath,
    });
    const ref = stdout.trim() || 'stash@{0}';

    logger.debug(`Stash pushed at ${ref} in ${worktreePath}`);
    return { ref };
  }

  async list(worktreePath: string): Promise<StashEntry[]> {
    const { stdout } = await execAsync('git stash list --format="%gd%x00%gs%x00%gD"', {
      cwd: worktreePath,
    });

    if (!stdout.trim()) return [];

    const entries: StashEntry[] = [];
    for (const line of stdout.trim().split('\n')) {
      const parts = line.split('\0');
      const ref = parts[0] ?? '';
      const subject = parts[1] ?? '';
      const indexMatch = ref.match(/stash@\{(\d+)\}/);
      const index = indexMatch ? parseInt(indexMatch[1], 10) : 0;

      // subject format: "WIP on <branch>: <hash> <message>" or "On <branch>: <message>"
      const branchMatch = subject.match(/^(?:WIP on|On) ([^:]+):/);
      const branch = branchMatch ? branchMatch[1] : '';

      entries.push({
        ref,
        index,
        message: subject,
        branch,
        description: subject,
      });
    }

    return entries;
  }

  async apply(worktreePath: string, stashRef: string): Promise<void> {
    await execFileAsync('git', ['stash', 'apply', stashRef], { cwd: worktreePath });
    logger.debug(`Applied stash ${stashRef} in ${worktreePath}`);
  }

  async drop(worktreePath: string, stashRef: string): Promise<void> {
    await execFileAsync('git', ['stash', 'drop', stashRef], { cwd: worktreePath });
    logger.debug(`Dropped stash ${stashRef} in ${worktreePath}`);
  }
}

export const stashService = new StashService();
