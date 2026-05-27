/**
 * Regression tests for the `feature` command group wiring + global-flag
 * propagation.
 *
 * Guards three bugs that shipped together and made `protomaker feature *`
 * unusable:
 *   1. The feature subcommands (list/get/create/update/move) were imported
 *      into cli.ts but never registered on the `feature` group, so
 *      `protomaker feature list` errored with "too many arguments".
 *   2. `updateCommand`/`moveCommand` had a stale `(program, flags)` signature
 *      that captured flags at registration time (before parse), so --json /
 *      --project never took effect.
 *   3. Commands resolved global flags from the subcommand's *local* opts
 *      instead of `optsWithGlobals()`, so the root-level --json / --quiet /
 *      --project were silently dropped — and `feature list` additionally
 *      omitted projectPath from the request body.
 *
 * These tests drive the real Commander program with a mocked `fetch`, so they
 * exercise the exact registration + parse path the CLI uses at runtime.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import {
  listCommand,
  getCommand,
  createCommand,
  updateCommand,
  moveCommand,
} from '../src/feature.js';

/** Build a program mirroring cli.ts: global flags + a wired `feature` group. */
function buildProgram(): Command {
  const program = new Command();
  program
    .option('--json', 'Output results as JSON', false)
    .option('--quiet', 'Suppress all non-error output', false)
    .option('--project <path>', 'Project path (defaults to cwd)', process.cwd())
    .exitOverride();

  const featureCmd = new Command('feature');
  listCommand(featureCmd);
  getCommand(featureCmd);
  createCommand(featureCmd);
  updateCommand(featureCmd);
  moveCommand(featureCmd);
  program.addCommand(featureCmd);

  return program;
}

/** Capture the JSON body of the most recent fetch call. */
let lastFetchBody: Record<string, unknown> | undefined;
let lastFetchUrl: string | undefined;

beforeEach(() => {
  lastFetchBody = undefined;
  lastFetchUrl = undefined;
  // A canned success response satisfying every feature endpoint shape.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      lastFetchUrl = url;
      lastFetchBody = init?.body ? JSON.parse(init.body as string) : undefined;
      return new Response(
        JSON.stringify({ success: true, features: [], feature: { id: 'feature-test' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    })
  );
  // Keep test output clean — the actions write to stdout in --json mode.
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('feature command group wiring', () => {
  it('registers all five feature subcommands', () => {
    const program = buildProgram();
    const featureCmd = program.commands.find((c) => c.name() === 'feature');
    expect(featureCmd).toBeDefined();
    const names = featureCmd!.commands.map((c) => c.name()).sort();
    expect(names).toEqual(['create', 'get', 'list', 'move', 'update']);
  });
});

describe('global flag propagation via optsWithGlobals', () => {
  it('feature list sends the --project path as projectPath in the body', async () => {
    await buildProgram().parseAsync([
      'node',
      'protomaker',
      '--project',
      '/custom/project',
      '--json',
      'feature',
      'list',
      '--status',
      'done',
    ]);

    expect(lastFetchBody).toBeDefined();
    expect(lastFetchBody!.projectPath).toBe('/custom/project');
    expect(lastFetchBody!.status).toBe('done');
  });

  it('feature move resolves --project from the root program', async () => {
    await buildProgram().parseAsync([
      'node',
      'protomaker',
      '--project',
      '/another/project',
      '--json',
      'feature',
      'move',
      'feature-test',
      'review',
    ]);

    expect(lastFetchUrl).toContain('/features/update');
    expect(lastFetchBody).toBeDefined();
    expect(lastFetchBody!.projectPath).toBe('/another/project');
    expect((lastFetchBody!.updates as Record<string, unknown>).status).toBe('review');
  });

  it('feature update resolves --project from the root program', async () => {
    await buildProgram().parseAsync([
      'node',
      'protomaker',
      '--project',
      '/proj/three',
      'feature',
      'update',
      'feature-test',
      '--title',
      'Renamed',
    ]);

    expect(lastFetchUrl).toContain('/features/update');
    expect(lastFetchBody).toBeDefined();
    expect(lastFetchBody!.projectPath).toBe('/proj/three');
    expect((lastFetchBody!.updates as Record<string, unknown>).title).toBe('Renamed');
  });
});
