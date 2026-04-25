/**
 * PrettierDriftAutofixCheck - Detects and auto-fixes PR CI failures caused by prettier drift.
 *
 * Triggers when:
 * - Feature status is 'review' AND
 * - A check run named 'checks' is failing AND
 * - The job log contains [warn] file paths and "Code style issues found" (prettier output) AND
 * - The 'checks' job is the only failing check run
 *
 * Fix: creates a temporary git worktree, runs npx prettier@<version> --write on the
 * offending files, verifies changes are format-only, commits with HUSKY=0, and pushes.
 * Posts a PR comment on success. Cleans up the worktree in a finally block.
 *
 * Idempotent: if prettier --write produces no changes (already clean), no commit is made.
 *
 * Gated by featureFlags.autoPrettierFix (default: true).
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from '../../feature-loader.js';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';
import type { SettingsService } from '../../settings-service.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('PrettierDriftAutofix');

/** Pattern for prettier [warn] file lines in CI output */
const WARN_FILE_RE = /^\[warn\]\s+(.+\.[a-zA-Z0-9]+)\s*$/;
/** Marker that confirms prettier found formatting violations */
const FORMAT_ISSUE_MARKER = 'Code style issues found';
/** The check workflow name that contains format:check */
const CHECKS_WORKFLOW_JOB_NAME = 'checks';

interface CheckRunEntry {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export class PrettierDriftAutofixCheck implements MaintenanceCheck {
  readonly id = 'prettier-drift-autofix';

  constructor(
    private readonly featureLoader: FeatureLoader,
    private readonly settingsService?: SettingsService
  ) {}

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    const settings = await this.settingsService?.getGlobalSettings().catch(() => null);
    const enabled = settings?.featureFlags?.autoPrettierFix ?? true;
    if (!enabled) return [];

    const issues: MaintenanceIssue[] = [];

    try {
      const features = await this.featureLoader.getAll(projectPath);
      const reviewFeatures = features.filter(
        (f) => f.status === 'review' && f.prNumber != null && f.branchName
      );

      for (const feature of reviewFeatures) {
        try {
          const issue = await this.inspectAndFix(
            projectPath,
            feature.id,
            feature.prNumber!,
            feature.branchName!
          );
          if (issue) {
            issues.push(issue);
          }
        } catch (err) {
          logger.warn(`PrettierDriftAutofix: error processing feature ${feature.id}: ${err}`);
        }
      }
    } catch (err) {
      logger.error(`PrettierDriftAutofix failed for ${projectPath}: ${err}`);
    }

    return issues;
  }

  private async inspectAndFix(
    projectPath: string,
    featureId: string,
    prNumber: number,
    branchName: string
  ): Promise<MaintenanceIssue | null> {
    // Get PR head SHA
    const prDetails = await this.fetchPRDetails(projectPath, prNumber);
    if (!prDetails) return null;

    const { headSha } = prDetails;

    // Get all check runs for this commit
    const checkRuns = await this.fetchCheckRuns(projectPath, headSha);
    if (checkRuns.length === 0) return null;

    // Find the failing 'checks' check run
    const failingChecksRun = checkRuns.find(
      (c) => c.name === CHECKS_WORKFLOW_JOB_NAME && c.conclusion === 'failure'
    );
    if (!failingChecksRun) return null;

    // Ensure it's the ONLY failing required check (ignore non-completed runs)
    const otherFailures = checkRuns.filter(
      (c) => c.conclusion === 'failure' && c.id !== failingChecksRun.id
    );
    if (otherFailures.length > 0) {
      logger.debug(
        `PrettierDriftAutofix: PR #${prNumber} has other failures (${otherFailures.map((c) => c.name).join(', ')}), skipping`
      );
      return null;
    }

    // Fetch job logs to detect prettier output
    const logs = await this.fetchJobLogs(projectPath, failingChecksRun.id);
    if (!logs) return null;

    const offendingFiles = this.parsePrettierFiles(logs);
    if (offendingFiles.length === 0) {
      logger.debug(`PrettierDriftAutofix: PR #${prNumber} checks failure is not a prettier issue`);
      return null;
    }

    logger.info(
      `PrettierDriftAutofix: PR #${prNumber} has prettier drift on ${offendingFiles.length} file(s): ${offendingFiles.join(', ')}`
    );

    // Apply the fix
    const fixed = await this.applyFix(projectPath, prNumber, branchName, offendingFiles);

    if (fixed === 'already_clean') {
      logger.info(`PrettierDriftAutofix: PR #${prNumber} is already clean (idempotent no-op)`);
      return null;
    }

    if (fixed === 'success') {
      return {
        checkId: this.id,
        severity: 'info',
        featureId,
        message: `PR #${prNumber}: auto-applied prettier formatting to ${offendingFiles.length} file(s) to fix CI drift`,
        autoFixable: false,
        fixDescription: 'Prettier fix committed and pushed',
        context: {
          featureId,
          prNumber,
          branchName,
          offendingFiles,
          projectPath,
        },
      };
    }

    // fix === 'failed' — return an issue with autoFixable false so operator can see it
    return {
      checkId: this.id,
      severity: 'warning',
      featureId,
      message: `PR #${prNumber}: prettier drift detected but auto-fix failed — manual intervention required`,
      autoFixable: false,
      context: {
        featureId,
        prNumber,
        branchName,
        offendingFiles,
        projectPath,
      },
    };
  }

  /**
   * Parse [warn] file lines from a GHA job log.
   * Returns the list of file paths that prettier reported as needing formatting.
   */
  parsePrettierFiles(log: string): string[] {
    // Only proceed if the "Code style issues found" marker is present
    if (!log.includes(FORMAT_ISSUE_MARKER)) return [];

    const files: string[] = [];
    for (const line of log.split('\n')) {
      // Strip GHA timestamp prefix if present
      const content = line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+/, '');
      const match = WARN_FILE_RE.exec(content);
      if (match) {
        files.push(match[1].trim());
      }
    }
    return files;
  }

  private async fetchPRDetails(
    projectPath: string,
    prNumber: number
  ): Promise<{ headSha: string; headBranch: string } | null> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['pr', 'view', String(prNumber), '--json', 'headRefOid,headRefName'],
        { cwd: projectPath, encoding: 'utf-8', timeout: 15_000 }
      );
      const data = JSON.parse(stdout) as { headRefOid: string; headRefName: string };
      return { headSha: data.headRefOid, headBranch: data.headRefName };
    } catch (err) {
      logger.debug(`PrettierDriftAutofix: failed to fetch PR #${prNumber} details: ${err}`);
      return null;
    }
  }

  private async fetchCheckRuns(projectPath: string, headSha: string): Promise<CheckRunEntry[]> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['api', `repos/{owner}/{repo}/commits/${headSha}/check-runs`, '--jq', '.check_runs'],
        { cwd: projectPath, encoding: 'utf-8', timeout: 15_000 }
      );
      return JSON.parse(stdout) as CheckRunEntry[];
    } catch (err) {
      logger.debug(`PrettierDriftAutofix: failed to fetch check runs for ${headSha}: ${err}`);
      return [];
    }
  }

  private async fetchJobLogs(projectPath: string, checkRunId: number): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['api', `repos/{owner}/{repo}/actions/jobs/${checkRunId}/logs`],
        {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 30_000,
          maxBuffer: 10 * 1024 * 1024,
        }
      );
      return stdout;
    } catch (err) {
      logger.debug(`PrettierDriftAutofix: failed to fetch logs for job ${checkRunId}: ${err}`);
      return null;
    }
  }

  private async applyFix(
    projectPath: string,
    prNumber: number,
    branchName: string,
    offendingFiles: string[]
  ): Promise<'success' | 'already_clean' | 'failed'> {
    // Get prettier version from project root package.json
    const prettierVersion = this.getPrettierVersion(projectPath);
    const tmpDir = path.join(os.tmpdir(), `pr-${prNumber}-${Date.now()}`);

    try {
      // Fetch the branch from origin
      await execFileAsync('git', ['fetch', 'origin', branchName], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30_000,
      });

      // Create temporary worktree tracking the branch
      await execFileAsync('git', ['worktree', 'add', tmpDir, `origin/${branchName}`], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 15_000,
      });

      // Set up branch tracking in the worktree
      await execFileAsync('git', ['checkout', '-B', branchName, `origin/${branchName}`], {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 10_000,
      });

      // Run prettier on the offending files
      const prettierCmd = prettierVersion ? `prettier@${prettierVersion}` : 'prettier';
      await execFileAsync(
        'npx',
        [prettierCmd, '--ignore-path', '/dev/null', '--write', ...offendingFiles],
        {
          cwd: tmpDir,
          encoding: 'utf-8',
          timeout: 60_000,
          env: { ...process.env },
        }
      );

      // Check if prettier made any changes
      const { stdout: diffOutput } = await execFileAsync('git', ['diff', '--name-only'], {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 10_000,
      });

      if (!diffOutput.trim()) {
        // No changes — already clean
        return 'already_clean';
      }

      // Safety check: ensure changes are format-only (no non-whitespace diffs)
      const { stdout: substantiveDiff } = await execFileAsync(
        'git',
        ['diff', '--ignore-all-space', '--ignore-blank-lines'],
        { cwd: tmpDir, encoding: 'utf-8', timeout: 10_000 }
      );

      if (substantiveDiff.trim()) {
        logger.warn(
          `PrettierDriftAutofix: PR #${prNumber} — prettier made non-whitespace changes, aborting auto-fix`
        );
        return 'failed';
      }

      // Commit the format changes
      const commitMessage = `style: apply prettier formatting\n\nAuto-formatted via ${prettierCmd} — prettier-drift recovery.`;
      await execFileAsync('git', ['commit', '-am', commitMessage], {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 15_000,
        env: { ...process.env, HUSKY: '0' },
      });

      // Push the branch
      await execFileAsync('git', ['push', 'origin', branchName], {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 30_000,
      });

      // Post a PR comment
      await this.postPRComment(
        projectPath,
        prNumber,
        `Auto-formatted via \`${prettierCmd}\` — prettier-drift recovery.`
      ).catch((err) => logger.warn(`PrettierDriftAutofix: failed to post PR comment: ${err}`));

      logger.info(`PrettierDriftAutofix: PR #${prNumber} prettier drift fixed and pushed`);
      return 'success';
    } catch (err) {
      logger.error(`PrettierDriftAutofix: fix failed for PR #${prNumber}: ${err}`);
      return 'failed';
    } finally {
      // Always clean up the temporary worktree
      try {
        await execFileAsync('git', ['worktree', 'remove', '--force', tmpDir], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 15_000,
        });
      } catch (cleanupErr) {
        logger.warn(`PrettierDriftAutofix: failed to remove worktree ${tmpDir}: ${cleanupErr}`);
        // Best-effort cleanup via fs
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // Ignore
        }
      }
    }
  }

  private getPrettierVersion(projectPath: string): string | null {
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };
      const version = pkg.devDependencies?.prettier ?? pkg.dependencies?.prettier ?? null;
      // Strip semver range prefixes (^, ~, >=, etc.)
      return version ? version.replace(/^[^0-9]*/, '') : null;
    } catch {
      return null;
    }
  }

  private async postPRComment(projectPath: string, prNumber: number, body: string): Promise<void> {
    await execFileAsync('gh', ['pr', 'comment', String(prNumber), '--body', body], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 15_000,
    });
  }
}
