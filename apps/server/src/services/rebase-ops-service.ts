/**
 * RebaseOpsService — encapsulates git rebase/merge/cherry-pick abort and continue
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabs-ai/utils';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const logger = createLogger('RebaseOpsService');

export type InProgressOperation = 'rebase' | 'merge' | 'cherry-pick' | 'none';

export class RebaseOpsService {
  async detectInProgressOperation(worktreePath: string): Promise<InProgressOperation> {
    const { stdout } = await execAsync('git status --porcelain=v2 --branch 2>/dev/null', {
      cwd: worktreePath,
    });

    if (stdout.includes('rebase-merge') || stdout.includes('rebase-apply')) return 'rebase';

    // Check filesystem markers
    const { exec: execRaw } = await import('child_process');
    const checkDir = (dir: string) =>
      new Promise<boolean>((resolve) => {
        execRaw(`test -d "${worktreePath}/${dir}"`, (err) => resolve(!err));
      });

    const checkFile = (file: string) =>
      new Promise<boolean>((resolve) => {
        execRaw(`test -f "${worktreePath}/${file}"`, (err) => resolve(!err));
      });

    if (await checkDir('.git/rebase-merge')) return 'rebase';
    if (await checkDir('.git/rebase-apply')) return 'rebase';
    if (await checkFile('.git/MERGE_HEAD')) return 'merge';
    if (await checkFile('.git/CHERRY_PICK_HEAD')) return 'cherry-pick';

    return 'none';
  }

  async abort(worktreePath: string): Promise<InProgressOperation> {
    const op = await this.detectInProgressOperation(worktreePath);

    if (op === 'none') {
      throw new Error('No rebase, merge, or cherry-pick operation in progress');
    }

    const abortArgs: Record<InProgressOperation, string[]> = {
      rebase: ['rebase', '--abort'],
      merge: ['merge', '--abort'],
      'cherry-pick': ['cherry-pick', '--abort'],
      none: [],
    };

    await execFileAsync('git', abortArgs[op], { cwd: worktreePath });
    logger.debug(`Aborted ${op} in ${worktreePath}`);
    return op;
  }

  async continue(worktreePath: string): Promise<InProgressOperation> {
    const op = await this.detectInProgressOperation(worktreePath);

    if (op === 'none') {
      throw new Error('No rebase, merge, or cherry-pick operation in progress');
    }

    const continueArgs: Record<InProgressOperation, string[]> = {
      rebase: ['rebase', '--continue'],
      merge: ['commit', '--no-edit'],
      'cherry-pick': ['cherry-pick', '--continue'],
      none: [],
    };

    await execFileAsync('git', continueArgs[op], {
      cwd: worktreePath,
      env: { ...process.env, GIT_EDITOR: 'true' },
    });
    logger.debug(`Continued ${op} in ${worktreePath}`);
    return op;
  }
}

export const rebaseOpsService = new RebaseOpsService();
