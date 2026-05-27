/**
 * Regression test for the CLI entry-point guard (isInvokedDirectly).
 *
 * The bug: the guard compared `process.argv[1]` to `import.meta.url` WITHOUT
 * resolving symlinks. When `protomaker` runs as an npm bin symlink (global install
 * / `npm link`), argv[1] is the symlink path (…/bin/protomaker) while import.meta.url
 * is the real dist/cli.js — so the guard failed and the CLI silently no-op'd as a
 * global command (the only way Ava and `/cli-control` invoke it). The fix resolves
 * argv[1] through realpath before comparing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isInvokedDirectly } from '../src/cli.js';

describe('isInvokedDirectly() — entry guard (symlinked bin)', () => {
  let dir: string;
  let realFile: string;
  let symlink: string;
  let otherFile: string;
  let realHref: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pm-cli-entry-'));
    realFile = join(dir, 'cli.js');
    symlink = join(dir, 'protomaker'); // mimics …/bin/protomaker → ../dist/cli.js
    otherFile = join(dir, 'runner.js'); // a real but different file (e.g. a test runner)
    writeFileSync(realFile, '// stub\n');
    writeFileSync(otherFile, '// runner\n');
    symlinkSync(realFile, symlink);
    // Resolve through realpath: on macOS tmpdir() itself is a symlink
    // (/var → /private/var), and the guard realpath-resolves argv[1], so the
    // expected module href must be the realpath'd one too.
    realHref = pathToFileURL(realpathSync(realFile)).href;
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns true when invoked via a symlinked bin (the global-install path)', () => {
    // This is the case the bug missed: argv[1] is the symlink, module is the real file.
    expect(isInvokedDirectly(symlink, realHref)).toBe(true);
  });

  it('returns true when invoked directly as the real file (node dist/cli.js)', () => {
    expect(isInvokedDirectly(realFile, realHref)).toBe(true);
  });

  it('returns false for a real but different argv[1] (e.g. a test runner — import safety)', () => {
    // otherFile exists, so realpathSync succeeds — this exercises the genuine
    // path-mismatch branch, not the realpathSync-throws branch below.
    expect(isInvokedDirectly(otherFile, realHref)).toBe(false);
  });

  it('returns false when argv[1] is undefined', () => {
    expect(isInvokedDirectly(undefined, realHref)).toBe(false);
  });

  it('returns false (never throws) when argv[1] does not exist on disk', () => {
    expect(isInvokedDirectly('/no/such/path/protomaker', realHref)).toBe(false);
  });
});
