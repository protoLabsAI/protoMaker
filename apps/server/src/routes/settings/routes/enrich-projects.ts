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
 * Backfill `github` owner/repo and `defaultBranch` onto ProjectRef entries that
 * are missing them. This is a fallback/refresh path only — the source of truth is
 * the values persisted at project setup (see setup/routes/project.ts). A project
 * that already carries BOTH fields is returned untouched, so it incurs no `.git`
 * inspection and its values survive even when the project repo is not on disk
 * (the mount-drop goal in #3948).
 *
 * Each project is backfilled independently — failures on one don't affect others.
 */
export async function enrichProjects(projects: ProjectRef[]): Promise<ProjectRef[]> {
  return Promise.all(
    projects.map(async (project) => {
      // Already persisted — serve as-is, no git inspection.
      if (project.github && project.defaultBranch) {
        return project;
      }

      const enriched = { ...project };

      // Resolve github owner/repo (best-effort) only if missing.
      if (!enriched.github) {
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
      }

      // Resolve defaultBranch (best-effort) only if missing.
      if (!enriched.defaultBranch) {
        try {
          const defaultBranch = await resolveDefaultBranch(project.path);
          if (defaultBranch) {
            enriched.defaultBranch = defaultBranch;
          }
        } catch {
          // Omit defaultBranch on failure
        }
      }

      return enriched;
    })
  );
}
