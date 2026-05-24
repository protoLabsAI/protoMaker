/**
 * Safe process execution primitives.
 *
 * Drop-in replacement for the `exec`/`execSync` shell-string pattern that has
 * historically caused command-injection issues whenever a caller interpolated
 * a branch name, worktree path, or file name into a shell command. Every
 * argument here is passed through an argv array — the shell is never invoked,
 * so quoting, glob expansion, command substitution, and metacharacters in
 * arguments are all inert.
 *
 * See: protoLabsAI/protoMaker#3597
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Conservative allowlist for values that will be interpolated as git refs
 *  or file path components. This is the intersection of:
 *  - Characters that git accepts as part of `check-ref-format` refs
 *  - Characters safe to put in a file path
 *  Branch names containing anything outside this set are refused before exec. */
const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]+$/;

export interface SafeExecOptions {
  /** Working directory for the spawned process. Required — refuses to inherit. */
  cwd: string;
  /** Environment variables. */
  env?: NodeJS.ProcessEnv;
  /** Timeout in ms. Default 30_000 (30s). */
  timeout?: number;
  /** Max stdout/stderr buffer size in bytes. Default 16 MiB. */
  maxBuffer?: number;
}

export interface SafeExecResult {
  stdout: string;
  stderr: string;
}

/** Thrown when a caller-supplied value contains characters that aren't safe to
 *  interpolate. Catch this at the call site if you want a softer failure mode. */
export class UnsafeRefError extends Error {
  constructor(fieldName: string, value: string) {
    super(
      `${fieldName} "${value}" contains characters outside [A-Za-z0-9._/-] — refusing for shell safety`
    );
    this.name = 'UnsafeRefError';
  }
}

/**
 * Validate that a string is safe to use as a git ref or path component before
 * passing it to `safeGit`/`safeExec`. Throws `UnsafeRefError` if not.
 *
 * @example
 *   assertSafeRef(feature.branchName, 'branchName');
 *   await safeGit(['push', '-u', 'origin', feature.branchName], { cwd });
 */
export function assertSafeRef(value: string, fieldName: string): void {
  if (!SAFE_REF_PATTERN.test(value)) {
    throw new UnsafeRefError(fieldName, value);
  }
}

/**
 * Return whether a string is safe to interpolate. Use when you want to
 * branch on validity rather than throw.
 */
export function isSafeRef(value: string): boolean {
  return SAFE_REF_PATTERN.test(value);
}

/**
 * Execute a binary with an argv array — no shell interpretation, ever.
 *
 * Use this in place of `exec`/`execSync` whenever ANY argument is dynamic.
 * Caller is responsible for the argv contents; this function will not
 * post-process or re-quote them.
 */
export async function safeExec(
  binary: string,
  args: string[],
  options: SafeExecOptions
): Promise<SafeExecResult> {
  const { stdout, stderr } = await execFileAsync(binary, args, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout ?? 30_000,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    encoding: 'utf-8',
  });
  return { stdout: stdout.toString(), stderr: stderr.toString() };
}

/**
 * Convenience wrapper for `git <args>`. Same shell-free guarantees as
 * `safeExec`. Use this for all git invocations where any argument is
 * dynamic (branch names, paths, file lists, commit messages).
 *
 * @example
 *   // Before — shell-string, vulnerable:
 *   //   await execAsync(`git push -u origin "${branchName}"`, { cwd });
 *   //
 *   // After — argv array, safe:
 *   assertSafeRef(branchName, 'branchName');
 *   await safeGit(['push', '-u', 'origin', branchName], { cwd });
 */
export async function safeGit(args: string[], options: SafeExecOptions): Promise<SafeExecResult> {
  return safeExec('git', args, options);
}
