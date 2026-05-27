/**
 * Enrich ProjectRef entries with github owner/repo and defaultBranch.
 *
 * Both operations are best-effort — failures are caught and fields omitted.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProjectRef } from '@protolabsai/types';
import { checkGitHubRemote } from '../../github/routes/check-github-remote.js';

const execFileAsync = promisify(execFile);

/**
 * Resolve the default branch from `git symbolic-ref refs/remotes/origin/HEAD`.
 * Returns null on any failure (best-effort).
 */
export async function resolveDefaultBranch(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: projectPath,
      timeout: 5000,
      encoding: 'utf-8',
    });
    const ref = stdout.trim(); // e.g., refs/remotes/origin/main
    const branch = ref.replace('refs/remotes/origin/', '');
    return branch || null;
  } catch {
    return null;
  }
}

/**
 * Enrich a list of ProjectRef entries with github owner/repo and defaultBranch.
 * Each project is enriched independently — failures on one project don't affect others.
 * Within each project, github and defaultBranch are resolved in parallel.
 */
export async function enrichProjects(projects: ProjectRef[]): Promise<ProjectRef[]> {
  return Promise.all(
    projects.map(async (project) => {
      const enriched = { ...project };

      // Resolve github owner/repo (best-effort)
      try {
        const remoteStatus = await checkGitHubRemote(project.path);
        if (remoteStatus.owner && remoteStatus.repo) {
          enriched.github = {
            owner: remoteStatus.owner,
            repo: remoteStatus.repo,
          };
        }
      } catch {
        // Omit github on failure
      }

      // Resolve defaultBranch (best-effort)
      try {
        const defaultBranch = await resolveDefaultBranch(project.path);
        if (defaultBranch) {
          enriched.defaultBranch = defaultBranch;
        }
      } catch {
        // Omit defaultBranch on failure
      }

      return enriched;
    })
  );
}
