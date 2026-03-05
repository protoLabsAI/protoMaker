/**
 * Worktree lock file utilities.
 *
 * When an agent starts executing in a worktree, a `.automaker-lock` file is
 * written containing the server process PID, feature ID, and start timestamp.
 * Before any worktree removal operation, callers check the lock file: if the
 * recorded PID is still alive, the removal is refused to prevent deleting a
 * worktree from under a running agent.
 */

import path from 'path';
import * as fs from 'fs/promises';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('WorktreeLock');

const LOCK_FILENAME = '.automaker-lock';

export interface WorktreeLock {
  /** PID of the process that owns this lock (server process) */
  pid: number;
  /** Feature ID being executed in this worktree */
  featureId: string;
  /** ISO timestamp when the lock was written */
  startedAt: string;
}

/**
 * Returns true if the given PID is alive on the current system.
 * Uses signal 0 (no-op probe) which succeeds without actually sending a signal.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Absolute path to the lock file inside a worktree */
export function getLockPath(worktreePath: string): string {
  return path.join(worktreePath, LOCK_FILENAME);
}

/**
 * Write a lock file to the worktree directory.
 * Called immediately before the agent starts executing in the worktree.
 */
export async function writeLock(worktreePath: string, featureId: string): Promise<void> {
  const lock: WorktreeLock = {
    pid: process.pid,
    featureId,
    startedAt: new Date().toISOString(),
  };

  try {
    await fs.writeFile(getLockPath(worktreePath), JSON.stringify(lock, null, 2), 'utf-8');
    logger.debug(`Lock written for feature ${featureId} in ${worktreePath}`);
  } catch (error) {
    // Non-fatal: log but do not block agent startup
    logger.warn(`Failed to write lock file for feature ${featureId}: ${error}`);
  }
}

/**
 * Remove the lock file from the worktree directory.
 * Called when agent execution completes (success or failure).
 */
export async function removeLock(worktreePath: string): Promise<void> {
  try {
    await fs.unlink(getLockPath(worktreePath));
    logger.debug(`Lock removed from ${worktreePath}`);
  } catch {
    // Lock file may not exist (e.g. was never written) — ignore
  }
}

/**
 * Read and parse the lock file from the worktree directory.
 * Returns null if no lock file exists or it cannot be parsed.
 */
export async function readLock(worktreePath: string): Promise<WorktreeLock | null> {
  try {
    const data = await fs.readFile(getLockPath(worktreePath), 'utf-8');
    return JSON.parse(data) as WorktreeLock;
  } catch {
    return null;
  }
}

/**
 * Returns true if the worktree has a valid lock file whose process is still alive.
 *
 * A lock is considered active when:
 * 1. The `.automaker-lock` file exists and is parseable
 * 2. The recorded PID is still alive (`process.kill(pid, 0)` succeeds)
 *
 * A stale lock (PID no longer running) is treated as not locked so cleanup
 * can proceed after a server restart.
 */
export async function isWorktreeLocked(worktreePath: string): Promise<boolean> {
  const lock = await readLock(worktreePath);
  if (!lock) return false;

  const alive = isProcessAlive(lock.pid);
  if (!alive) {
    logger.debug(
      `Stale lock found in ${worktreePath} (PID ${lock.pid} no longer running, feature ${lock.featureId})`
    );
  }
  return alive;
}
