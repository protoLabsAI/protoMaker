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
import { Command } from 'commander';
import { type GlobalFlags, usageError, exitError } from './output.js';
import { listCommand, getCommand, createCommand, updateCommand, moveCommand } from './feature.js';
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

// ---------------------------------------------------------------------------
// Entry — exit-code discipline
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
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

main().catch((err: any) => {
  // Commander exitOverride throws CommanderError on failures
  const commanderCode = err?.code;

  // --help / --version are fine
  if (commanderCode === 'COMMANDER_HELP' || commanderCode === 'COMMANDER_VERSION') {
    process.exit(0);
  }

  // Usage errors (unknown command, missing required arg, etc.) → exit 2
  if (
    commanderCode === 'COMMANDER_INCORRECTVALUE' ||
    commanderCode === 'COMMANDER_ARGUMENT_MISSING' ||
    commanderCode === 'COMMANDER_CREATE_OPTION_FAILED'
  ) {
    usageError(err.message || String(err));
  }

  // Runtime error → exit 1
  exitError(err.message || String(err));
});
