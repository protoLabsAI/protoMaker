/**
 * BeadsService — Subprocess wrapper around `br` (beads_rust) for per-project issue tracking.
 *
 * Storage: .beads/ under each projectPath (SQLite + JSONL — managed by `br`).
 * This service NEVER touches the DB or JSONL directly; it shells out to `br`
 * so concurrency and auto-flush stay consistent with the CLI's invariants.
 *
 * All commands run with `cwd: projectPath`, `--json`, and `RUST_LOG=error`
 * to keep stdout machine-parseable.
 *
 * @see https://github.com/Dicklesworthstone/beads_rust
 * @see CLAUDE.md — "Local Issue Tracker: `br` (beads)"
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import { validatePath } from '@protolabsai/platform';
import type { BeadsIssue, CreateBeadsIssueInput, UpdateBeadsIssueInput } from '@protolabsai/types';

const execFileAsync = promisify(execFile);
const logger = createLogger('BeadsService');

export type { BeadsIssue, CreateBeadsIssueInput, UpdateBeadsIssueInput };

export class BeadsService {
  /**
   * List all non-tombstoned issues for a project. Includes both open and closed.
   * Tombstones (soft-deleted) are always excluded.
   */
  async list(projectPath: string): Promise<BeadsIssue[]> {
    validatePath(projectPath);
    const raw = await this.run(projectPath, ['list', '--all', '--json']);
    const parsed = this.parseJson<BeadsIssue[] | { issues?: BeadsIssue[] }>(raw);
    const issues = Array.isArray(parsed) ? parsed : (parsed.issues ?? []);
    return issues.filter((i) => i.status !== 'tombstone');
  }

  /**
   * List only issues that are not blocked by open dependencies (actionable).
   */
  async ready(projectPath: string): Promise<BeadsIssue[]> {
    validatePath(projectPath);
    const raw = await this.run(projectPath, ['ready', '--json']);
    const parsed = this.parseJson<BeadsIssue[] | { issues?: BeadsIssue[] }>(raw);
    return Array.isArray(parsed) ? parsed : (parsed.issues ?? []);
  }

  async show(projectPath: string, id: string): Promise<BeadsIssue> {
    validatePath(projectPath);
    const raw = await this.run(projectPath, ['show', id, '--json']);
    return this.parseJson<BeadsIssue>(raw);
  }

  async create(projectPath: string, input: CreateBeadsIssueInput): Promise<BeadsIssue> {
    validatePath(projectPath);
    const args = ['create', input.title, '--json'];
    if (input.type) args.push('--type', input.type);
    if (input.priority !== undefined) args.push('--priority', String(input.priority));
    if (input.description) args.push('--description', input.description);
    if (input.assignee) args.push('--assignee', input.assignee);
    const raw = await this.run(projectPath, args);
    return this.parseJson<BeadsIssue>(raw);
  }

  async update(projectPath: string, id: string, input: UpdateBeadsIssueInput): Promise<BeadsIssue> {
    validatePath(projectPath);
    const args = ['update', id, '--json'];
    if (input.title) args.push('--title', input.title);
    if (input.description) args.push('--description', input.description);
    if (input.status) args.push('--status', input.status);
    if (input.priority !== undefined) args.push('--priority', String(input.priority));
    if (input.type) args.push('--type', input.type);
    if (input.assignee) args.push('--assignee', input.assignee);
    const raw = await this.run(projectPath, args);
    const parsed = this.parseJson<BeadsIssue[] | BeadsIssue>(raw);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  }

  async close(projectPath: string, id: string, reason?: string): Promise<BeadsIssue> {
    validatePath(projectPath);
    const args = ['close', id, '--json'];
    if (reason) args.push('--reason', reason);
    const raw = await this.run(projectPath, args);
    const parsed = this.parseJson<BeadsIssue[] | BeadsIssue>(raw);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  }

  async delete(projectPath: string, id: string): Promise<{ deleted: string[] }> {
    validatePath(projectPath);
    const raw = await this.run(projectPath, ['delete', id, '--json']);
    return this.parseJson<{ deleted: string[] }>(raw);
  }

  /**
   * Run `br` with the given args. Throws with stderr context on non-zero exit.
   * Sets RUST_LOG=error so dependency log lines never contaminate stdout.
   */
  private async run(projectPath: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('br', args, {
        cwd: projectPath,
        env: { ...process.env, RUST_LOG: 'error' },
        maxBuffer: 16 * 1024 * 1024,
        timeout: 15_000,
      });
      return stdout;
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
      const stderr = (e.stderr ?? '').trim();
      const stdout = (e.stdout ?? '').trim();
      logger.error('br command failed', { args, code: e.code, stderr, stdout });
      throw new Error(
        `br ${args[0]} failed${stderr ? `: ${stderr}` : ''}${stdout ? ` (stdout: ${stdout})` : ''}`
      );
    }
  }

  private parseJson<T>(raw: string): T {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new Error('br returned empty output');
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch (err) {
      throw new Error(
        `br returned invalid JSON: ${err instanceof Error ? err.message : String(err)} (raw: ${trimmed.slice(0, 200)})`
      );
    }
  }
}
