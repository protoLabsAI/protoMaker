#!/usr/bin/env node

/**
 * protomaker CLI
 *
 * Command-line interface for protoLabs.studio.
 *
 * Usage:
 *   protomaker <command> [options]
 *   protomaker --help
 *
 * Global flags:
 *   --json      Output results as JSON
 *   --quiet     Suppress all non-error output
 *   --project   Project path (defaults to cwd)
 *
 * Exit codes:
 *   0 = success
 *   1 = runtime error
 *   2 = usage error
 */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { Command } from 'commander';
import { type GlobalFlags, usageError, exitError } from './output.js';
import {
  listCommand,
  getCommand,
  createCommand,
  updateCommand,
  moveCommand,
  deleteCommand,
} from './feature.js';
import {
  startCommand,
  stopCommand,
  listCommand as agentListCommand,
  outputCommand,
  messageCommand,
} from './agent.js';
import {
  createCommand as prCreateCommand,
  statusCommand as prStatusCommand,
  mergeCommand as prMergeCommand,
} from './pr.js';
import {
  addCommand as queueAddCommand,
  listCommand as queueListCommand,
  clearCommand as queueClearCommand,
} from './queue.js';
import {
  startCommand as autoModeStartCommand,
  stopCommand as autoModeStopCommand,
  statusCommand as autoModeStatusCommand,
} from './auto-mode.js';
import { boardCommand, queryCommand } from './board.js';
import {
  listCommand as contextListCommand,
  getCommand as contextGetCommand,
  createCommand as contextCreateCommand,
  deleteCommand as contextDeleteCommand,
} from './context.js';
import { sitrepCommand } from './sitrep.js';
import { healthCommand } from './health.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

/**
 * Build the protomaker CLI program with every command group wired. Exported so
 * tests can drive the exact runtime wiring (subcommand registration + global
 * flag propagation) without spawning the process — see test/cli-wiring.test.ts.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('protomaker')
    .description('CLI for protoLabs.studio — automate AI engineering workflows')
    .version(version)
    // -----------------------------------------------------------------------
    // Global flags
    // -----------------------------------------------------------------------
    .option('--json', 'Output results as JSON', false)
    .option('--quiet', 'Suppress all non-error output', false)
    .option('--project <path>', 'Project path (defaults to cwd)', process.cwd())
    .exitOverride(); // Prevent Commander from calling process.exit — we control exit codes

  // ---------------------------------------------------------------------------
  // Command groups
  // ---------------------------------------------------------------------------

  /**
   * Project commands — initialize, configure, and manage protomaker projects.
   */
  const projectCmd = new Command('project');
  projectCmd
    .description('Manage protomaker projects')
    .addHelpText(
      'afterAll',
      `\nCommands:\n  init    Initialize a new protomaker project\n  config  View or edit project configuration`
    );

  /**
   * Agent commands — manage AI agents and workflows.
   */
  const agentCmd = new Command('agent');
  agentCmd
    .description('Manage AI agents and workflows')
    .addHelpText(
      'afterAll',
      `\nCommands:\n  start   Dispatch an agent for a feature\n  stop    Stop a running agent\n  list    Show running agents\n  output  Print agent output for a feature\n  message Send a follow-up message to a running agent`
    );

  startCommand(agentCmd);
  stopCommand(agentCmd);
  agentListCommand(agentCmd);
  outputCommand(agentCmd);
  messageCommand(agentCmd);

  /**
   * Dev commands — development and debugging utilities.
   */
  const devCmd = new Command('dev');
  devCmd
    .description('Development and debugging utilities')
    .addHelpText('afterAll', `\nCommands:\n  info    Show environment and project info`);

  /**
   * Feature commands — core board operations (list, get, create, update, move).
   */
  const featureCmd = new Command('feature');
  featureCmd
    .description('Core board commands — manage features')
    .addHelpText(
      'afterAll',
      `\nCommands:\n  list      List features grouped by status\n  get       Show full feature details\n  create    Create a new feature\n  update    Update a feature\n  move      Transition feature status`
    );

  listCommand(featureCmd);
  getCommand(featureCmd);
  createCommand(featureCmd);
  updateCommand(featureCmd);
  moveCommand(featureCmd);
  deleteCommand(featureCmd);

  /**
   * PR commands — pull request lifecycle (create, status, merge).
   */
  const prCmd = new Command('pr');
  prCmd
    .description('Pull request commands — create, check status, and merge PRs')
    .addHelpText(
      'afterAll',
      `\nCommands:\n  create  Open a PR from a feature worktree\n  status  Show CI rollup for a PR\n  merge   Merge a PR with the configured strategy`
    );

  prCreateCommand(prCmd);
  prStatusCommand(prCmd);
  prMergeCommand(prCmd);

  /**
   * Queue commands — manage the execution queue.
   */
  const queueCmd = new Command('queue');
  queueCmd
    .description('Manage the feature execution queue')
    .addHelpText(
      'afterAll',
      `\nCommands:\n  add     Add a feature to the queue\n  list    List features in the queue\n  clear   Clear all features from the queue`
    );

  queueAddCommand(queueCmd);
  queueListCommand(queueCmd);
  queueClearCommand(queueCmd);

  /**
   * Auto-mode commands — control the auto-mode loop.
   */
  const autoModeCmd = new Command('auto-mode');
  autoModeCmd
    .description('Control the auto-mode loop')
    .addHelpText(
      'afterAll',
      `\nCommands:\n  start   Start the auto-mode loop\n  stop    Stop the auto-mode loop\n  status  Show auto-mode status`
    );

  autoModeStartCommand(autoModeCmd);
  autoModeStopCommand(autoModeCmd);
  autoModeStatusCommand(autoModeCmd);

  /**
   * Context commands — manage project context files.
   */
  const contextCmd = new Command('context');
  contextCmd
    .description('Manage project context files')
    .addHelpText(
      'afterAll',
      `\nCommands:\n  list      List all context files\n  get       Read a context file\n  create    Create a new context file\n  delete    Delete a context file`
    );

  contextListCommand(contextCmd);
  contextGetCommand(contextCmd);
  contextCreateCommand(contextCmd);
  contextDeleteCommand(contextCmd);

  // ---------------------------------------------------------------------------
  // Register command groups
  // ---------------------------------------------------------------------------

  program.addCommand(projectCmd);
  program.addCommand(agentCmd);
  program.addCommand(devCmd);
  program.addCommand(featureCmd);
  program.addCommand(prCmd);
  program.addCommand(queueCmd);
  program.addCommand(autoModeCmd);
  program.addCommand(contextCmd);

  // Top-level commands (registered directly on program).
  boardCommand(program);
  queryCommand(program);
  sitrepCommand(program);
  healthCommand(program);

  return program;
}

// ---------------------------------------------------------------------------
// Entry — exit-code discipline
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const program = buildProgram();
  // Show help if no command provided (exit code 2 = usage error).
  // outputHelp() prints without exiting; help() would call process.exit(0)
  // internally, making the intended exit(2) below unreachable.
  if (!process.argv.slice(2).length) {
    program.outputHelp();
    process.exit(2);
  }

  // parseAsync (not parse) so async action handlers — which await the API call
  // before printing — complete before we exit. With the synchronous parse() the
  // process exited (process.exit(0) below) before any handler's fetch resolved,
  // so every command produced no output.
  await program.parseAsync(process.argv);

  // Success — exit code 0
  process.exit(0);
}

/**
 * Whether the CLI was invoked directly (so it should parse argv and run), versus
 * imported (tests import `buildProgram` and must not trigger a parse of the test
 * runner's argv, which would call process.exit mid-test).
 *
 * `argv1` MUST be resolved through realpath before comparing: when the CLI runs via
 * an npm bin symlink (global install / `npm link`), argv1 is the symlink path
 * (…/bin/protomaker) while `moduleHref` is the real dist/cli.js. Comparing the raw
 * paths makes the guard fail and the CLI silently no-ops as a global command — the
 * only way Ava and `/cli-control` invoke it. realpathSync collapses the symlink so
 * the linked-bin and `node dist/cli.js` forms both match; a test runner's argv1
 * resolves to the runner path and still won't match, preserving import-safety.
 */
export function isInvokedDirectly(argv1: string | undefined, moduleHref: string): boolean {
  if (argv1 == null) return false;
  try {
    return moduleHref === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
  }
}

const invokedDirectly = isInvokedDirectly(process.argv[1], import.meta.url);

if (invokedDirectly) {
  main().catch((err: any) => {
    // Commander (with exitOverride) throws a CommanderError whose `.code` is a
    // dotted string like `commander.version` and whose `.exitCode` is the exit
    // code it would have used. See https://github.com/tj/commander.js.
    const commanderCode: string | undefined = typeof err?.code === 'string' ? err.code : undefined;
    const isCommander = commanderCode?.startsWith('commander.') ?? false;

    // Clean display exits — --help and --version print their output and Commander
    // throws with exitCode 0. These are not errors; exit 0 with no "Error:" noise.
    if (isCommander && err?.exitCode === 0) {
      process.exit(0);
    }

    // Usage errors (unknown command/option, missing/excess args, bad value) → exit 2.
    // Any other commander.* code is a usage problem; Commander already printed the
    // specifics to stderr, so surface its message at exit code 2.
    if (isCommander) {
      usageError(err.message || String(err));
    }

    // Runtime error → exit 1
    exitError(err.message || String(err));
  });
}
