/**
 * CherryPickService — encapsulates git cherry-pick operations for worktrees
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabs-ai/utils';

const execFileAsync = promisify(execFile);
const logger = createLogger('CherryPickService');

const HEX_COMMIT_RE = /^[0-9a-f]{4,40}$/i;

export class CherryPickService {
  /**
   * Validate that all commit hashes are hex strings before executing
   */
  validateCommits(commits: string[]): void {
    for (const commit of commits) {
      if (!HEX_COMMIT_RE.test(commit)) {
        throw new Error(`Invalid commit hash: "${commit}". Must be a hex string (4-40 chars).`);
      }
    }
  }

  async cherryPick(worktreePath: string, commits: string[]): Promise<void> {
    this.validateCommits(commits);
    await execFileAsync('git', ['cherry-pick', ...commits], { cwd: worktreePath });
    logger.debug(`Cherry-picked ${commits.length} commit(s) in ${worktreePath}`);
  }
}

export const cherryPickService = new CherryPickService();
