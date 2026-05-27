/**
 * CLI wiring regression tests (#3925).
 *
 * Drives the REAL program from `buildProgram()` (not a re-declared copy), so
 * these guard the exact runtime wiring:
 *   1. Every command group is registered with all its subcommands — the class
 *      of bug from #3924, where `feature` was imported but never wired and
 *      arg-bearing commands were unreachable.
 *   2. The root-level global flags (--json / --quiet / --project) propagate into
 *      each subcommand via optsWithGlobals(), and `projectPath` reaches the
 *      request body — so `--project <path>` actually targets that project.
 *
 * `fetch` is stubbed so no server is needed; we assert on the captured request.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildProgram } from '../src/cli.js';

let lastUrl: string | undefined;
let lastBody: Record<string, unknown> | undefined;

beforeEach(() => {
  lastUrl = undefined;
  lastBody = undefined;
  // Canned success body covering every read command's expected shape so none
  // hit a `process.exit(1)` / missing-data branch.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      lastUrl = url;
      lastBody = init?.body ? JSON.parse(init.body as string) : undefined;
      return new Response(
        JSON.stringify({
          success: true,
          features: [],
          feature: { id: 'feat-created' },
          issues: [],
          files: [],
          runningFeatures: [],
          queue: [],
          summary: {},
          count: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    })
  );
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Sub-subcommand names registered under a top-level group. */
function subcommandsOf(group: string): string[] {
  const program = buildProgram();
  const cmd = program.commands.find((c) => c.name() === group);
  return cmd ? cmd.commands.map((c) => c.name()).sort() : [];
}

describe('command group registration', () => {
  it.each([
    ['feature', ['create', 'get', 'list', 'move', 'update']],
    ['agent', ['list', 'message', 'output', 'start', 'stop']],
    ['pr', ['create', 'merge', 'status']],
    ['queue', ['add', 'clear', 'list']],
    ['context', ['create', 'delete', 'get', 'list']],
  ])('group "%s" registers all its subcommands', (group, expected) => {
    expect(subcommandsOf(group)).toEqual(expected);
  });

  it('registers the top-level commands directly on the program', () => {
    const names = buildProgram()
      .commands.map((c) => c.name())
      .sort();
    for (const top of ['board', 'query', 'sitrep', 'health']) {
      expect(names).toContain(top);
    }
    for (const group of ['feature', 'agent', 'pr', 'queue', 'context', 'auto-mode']) {
      expect(names).toContain(group);
    }
  });
});

describe('global flag propagation (--project / --json) reaches the request body', () => {
  // Read commands that succeed on an empty canned body (no required args, no exit).
  it.each([
    ['feature list', ['feature', 'list']],
    ['agent list', ['agent', 'list']],
    ['queue list', ['queue', 'list']],
    ['context list', ['context', 'list']],
    ['board', ['board']],
    ['query', ['query', '--status', 'done']],
  ])('%s sends the --project path as projectPath', async (_label, argv) => {
    await buildProgram().parseAsync([
      'node',
      'protomaker',
      '--project',
      '/custom/project',
      '--json',
      ...argv,
    ]);
    expect(lastBody, `${_label} made no request`).toBeDefined();
    expect(lastBody!.projectPath).toBe('/custom/project');
  });
});

describe('feature create maps --execution-mode / --workflow into the payload (#3946)', () => {
  it('sends executionMode and workflow on the created feature', async () => {
    await buildProgram().parseAsync([
      'node',
      'protomaker',
      '--project',
      '/custom/project',
      '--json',
      'feature',
      'create',
      '--description',
      'Audit the auth module',
      '--execution-mode',
      'read-only',
      '--workflow',
      'audit',
    ]);
    expect(lastUrl).toMatch(/\/features\/create$/);
    expect(lastBody!.projectPath).toBe('/custom/project');
    const feature = lastBody!.feature as Record<string, unknown>;
    expect(feature.executionMode).toBe('read-only');
    expect(feature.workflow).toBe('audit');
  });
});
