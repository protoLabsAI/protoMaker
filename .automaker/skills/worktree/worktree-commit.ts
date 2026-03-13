/**
 * Typed examples of safe worktree commit patterns.
 * See committing.md for the full skill documentation.
 */
import { execSync, ExecSyncOptions } from 'child_process';

interface CommitOptions {
  worktreePath: string;
  /** Specific files to stage — never pass [] to avoid unintended no-op */
  files: [string, ...string[]];
  message: string;
}

const execOpts = (cwd: string): ExecSyncOptions => ({ cwd, stdio: 'inherit' });

/**
 * Format, stage specific files, and commit in a worktree.
 *
 * Rules enforced:
 *  - Never `git add -A` / `git add .` (captures .automaker/ runtime state)
 *  - Run prettier before staging (CI runs format:check on every PR)
 */
export function commitInWorktree(options: CommitOptions): void {
  const { worktreePath, files, message } = options;

  // Format before staging — CI will fail format:check if skipped
  execSync(
    `node "${worktreePath}/node_modules/.bin/prettier" --write --ignore-path /dev/null ${files.join(' ')}`,
    execOpts(worktreePath),
  );

  // Stage specific files only
  execSync(`git -C "${worktreePath}" add ${files.join(' ')}`, execOpts(worktreePath));
  execSync(`git -C "${worktreePath}" commit -m "${message}"`, execOpts(worktreePath));
}

/**
 * Persist-first status update pattern.
 * Never mutate in-memory state before the disk write succeeds.
 */
export async function updateStatusSafe<T extends { status: string }>(
  entity: T,
  newStatus: string,
  persist: (status: string) => Promise<void>,
): Promise<void> {
  const prevStatus = entity.status;
  try {
    await persist(newStatus);
    entity.status = newStatus;
  } catch (err) {
    entity.status = prevStatus;
    throw err;
  }
}
